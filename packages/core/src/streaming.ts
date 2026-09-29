import {
  AccessToken,
  DataPacket_Kind,
  EgressClient,
  ImageFileSuffix,
  ImageOutput,
  RoomServiceClient,
  S3Upload,
  TrackSource,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';

export type StreamSource = 'camera' | 'screen' | 'screen_camera';

/** Server-side view of the media layer. LiveKit in production, a fake in tests. */
export interface StreamingProvider {
  readonly wsUrl: string;
  createRoom(room: string): Promise<void>;
  deleteRoom(room: string): Promise<void>;
  removeParticipant(room: string, identity: string): Promise<void>;
  /** Server → room message (chat, warnings, blur). Clients never publish data themselves. */
  sendData(room: string, topic: string, payload: object, destinationIdentities?: string[]): Promise<void>;
  listParticipantIdentities(room: string): Promise<string[]>;
  roomExists(room: string): Promise<boolean>;
  publisherToken(room: string, identity: string, name: string): Promise<string>;
  viewerToken(room: string, identity: string): Promise<string>;
  receiveWebhook(body: string, authHeader: string | null): Promise<WebhookEvent>;
  startSnapshots(
    room: string,
    identity: string,
    source: StreamSource,
    prefix: string,
  ): Promise<string | null>;
  stopEgress(egressId: string): Promise<void>;
}

export interface LiveKitConfig {
  url: string; // wss://…
  apiKey: string;
  apiSecret: string;
  /** Egress image upload target (Cloudflare R2, S3-compatible). Snapshots are skipped when absent. */
  snapshots?: { endpoint: string; bucket: string; accessKey: string; secret: string; region?: string };
}

const PUBLISHER_TTL = '1h';
const VIEWER_TTL = '1h';

export class LiveKitStreaming implements StreamingProvider {
  readonly wsUrl: string;
  private readonly rooms: RoomServiceClient;
  private readonly egress: EgressClient;
  private readonly webhooks: WebhookReceiver;

  constructor(private readonly cfg: LiveKitConfig) {
    this.wsUrl = cfg.url;
    const host = cfg.url.replace(/^ws/, 'http');
    this.rooms = new RoomServiceClient(host, cfg.apiKey, cfg.apiSecret);
    this.egress = new EgressClient(host, cfg.apiKey, cfg.apiSecret);
    this.webhooks = new WebhookReceiver(cfg.apiKey, cfg.apiSecret);
  }

  async createRoom(room: string) {
    // departureTimeout gives a streamer 30s to reconnect after a network blip before the room closes.
    await this.rooms.createRoom({ name: room, emptyTimeout: 120, departureTimeout: 30 });
  }

  async deleteRoom(room: string) {
    await this.rooms.deleteRoom(room).catch((err: { status?: number }) => {
      if (err?.status !== 404) throw err;
    });
  }

  async removeParticipant(room: string, identity: string) {
    await this.rooms.removeParticipant(room, identity).catch((err: { status?: number }) => {
      if (err?.status !== 404) throw err;
    });
  }

  async sendData(room: string, topic: string, payload: object, destinationIdentities?: string[]) {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await this.rooms.sendData(room, data, DataPacket_Kind.RELIABLE, { topic, destinationIdentities });
  }

  async listParticipantIdentities(room: string) {
    const participants = await this.rooms.listParticipants(room);
    return participants.map((p) => p.identity);
  }

  async roomExists(room: string) {
    return (await this.rooms.listRooms([room])).length > 0;
  }

  async publisherToken(room: string, identity: string, name: string) {
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, { identity, name, ttl: PUBLISHER_TTL });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ],
      canPublishData: false,
      canSubscribe: true,
    });
    return at.toJwt();
  }

  async viewerToken(room: string, identity: string) {
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, { identity, ttl: VIEWER_TTL });
    at.addGrant({ room, roomJoin: true, canPublish: false, canPublishData: false, canSubscribe: true });
    return at.toJwt();
  }

  receiveWebhook(body: string, authHeader: string | null) {
    return this.webhooks.receive(body, authHeader ?? undefined);
  }

  async startSnapshots(room: string, identity: string, source: StreamSource, prefix: string) {
    const s = this.cfg.snapshots;
    if (!s) return null;
    const images = new ImageOutput({
      captureInterval: 60,
      width: 320,
      height: 180,
      filenamePrefix: prefix,
      filenameSuffix: ImageFileSuffix.IMAGE_SUFFIX_TIMESTAMP,
      output: {
        case: 's3',
        value: new S3Upload({
          endpoint: s.endpoint,
          bucket: s.bucket,
          accessKey: s.accessKey,
          secret: s.secret,
          region: s.region ?? 'auto',
          forcePathStyle: true,
        }),
      },
    });
    const info = await this.egress.startParticipantEgress(
      room,
      identity,
      { images },
      { screenShare: source !== 'camera' },
    );
    return info.egressId;
  }

  async stopEgress(egressId: string) {
    await this.egress.stopEgress(egressId).catch(() => undefined);
  }
}
