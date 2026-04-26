export type ApiErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: {
      fields?: Array<{ field: string; message: string }>;
    };
  };
  traceId?: string;
};

export type User = {
  id: string;
  username?: string;
  handle?: string | null;
  avatar?: string | null;
  discriminator?: string | null;
};

export type Session = {
  user: User;
  guilds: Array<{ id: string; name: string; icon?: string | null }>;
  csrfToken: string;
};

export type Guild = {
  id: string;
  name: string;
  icon?: string | null;
  botIcon?: string | null;
  canManage: boolean;
  botJoined?: boolean | null;
  botJoinSource?: string;
};

export type Permission = {
  guildId: string;
  hasAccess: boolean;
  hasManageGuild: boolean;
  botJoined?: boolean | null;
  botGuildSource?: string;
};

export type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  position: number;
  parentId?: string | null;
};

export type DiscordRole = {
  id: string;
  name: string;
  color: number;
  position: number;
  mentionable: boolean;
};

export type Tracker = {
  id: string;
  youtube?: {
    username?: string;
    channelId?: string;
    title?: string | null;
  };
  discord?: {
    channelId?: string;
    roleId?: string | null;
  };
  notifications?: {
    contentFilter?: string;
    embedLayout?: string;
    customMessage?: string | null;
    titleFilters?: string[];
  };
  state?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  configUpdatedAt?: string | null;
  configuredAt?: string | null;
  stateUpdatedAt?: string | null;
  lastCheckedAt?: string | null;
  lastVideoId?: string | null;
  lastPublishedAt?: string | null;
  lastVideoPublishedAt?: string | null;
};

export type TitleWatch = {
  id: string;
  keyword: string;
  channelId: string;
  roleId?: string | null;
  maxAgeDays: number;
  createdAt?: string;
  updatedAt?: string;
  configUpdatedAt?: string | null;
  configuredAt?: string | null;
  stateUpdatedAt?: string | null;
  lastMatchedAt?: string | null;
  lastVideoId?: string | null;
};

export type Settings = {
  prefix?: string;
  logChannelId?: string | null;
  logLevel?: string;
  previewOnAdd?: boolean;
  updatedAt?: string;
};

export type Health = {
  runtime?: {
    uptimeSec?: number;
    rssMemoryMb?: number;
    heapUsedMb?: number;
  };
  config?: {
    trackerCount?: number;
    titleWatchCount?: number;
    prefix?: string;
    previewOnAdd?: boolean;
  };
  storage?: {
    driver?: string;
    resourceName?: string;
    dataFileExists?: boolean;
    dataFileSizeKb?: number;
    dataFileModifiedAt?: string | null;
  };
};

export type LogEntry = {
  id?: string;
  createdAt?: string;
  level?: string;
  scope?: string;
  message?: string;
  meta?: unknown;
};

export type NotificationEntry = {
  id?: string;
  createdAt?: string;
  source?: string;
  status?: string;
  event?: string;
  title?: string;
  videoId?: string;
  link?: string;
  youtubeChannelTitle?: string;
  youtubeUsername?: string;
  keyword?: string;
  contentLabel?: string;
  contentState?: string;
  discordChannelId?: string;
};

export type AuditEntry = {
  id?: string;
  createdAt?: string;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export type YoutubeResolveResult = {
  username: string;
  channelId: string;
  title: string;
  resolvedUrl?: string;
  latestVideo?: {
    videoId: string;
    title: string;
    link: string;
    publishedAt?: string | null;
    channelTitle?: string | null;
    label?: string;
  } | null;
};
