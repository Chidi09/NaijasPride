import { ContentStatus, MusicGenre, MusicRegion } from "../enums";

export interface MusicVideo {
  id: string;
  title: string;
  slug: string;
  artist: string;
  artistSlug: string;
  featuring: string[];
  album: string | null;
  year: number;
  genre: MusicGenre[];
  region: MusicRegion;
  durationSeconds: number | null;

  youtubeId: string;
  channelId: string | null;
  channelTitle: string | null;

  thumbnailUrl: string | null;
  hdThumbnailUrl: string | null;

  isOfficial: boolean;
  isExplicit: boolean;

  viewCount: number;
  playCount: number;
  likeCount: number;
  weeklyPlays: number;
  ytViewCount: number;
  ytLikeCount: number;

  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;

  // Auth-dependent fields (populated when authenticated)
  isLiked?: boolean;
}

export interface MusicVideoSummary {
  id: string;
  title: string;
  slug: string;
  artist: string;
  artistSlug: string;
  featuring: string[];
  year: number;
  genre: MusicGenre[];
  region: MusicRegion;
  durationSeconds: number | null;
  youtubeId: string;
  thumbnailUrl: string | null;
  hdThumbnailUrl: string | null;
  isOfficial: boolean;
  isExplicit: boolean;
  viewCount: number;
  playCount: number;
  likeCount: number;
  weeklyPlays: number;
  ytViewCount: number;
  ytLikeCount: number;
  isLiked?: boolean;
}

export interface MusicArtistPage {
  artistSlug: string;
  artistName: string;
  region: MusicRegion;
  totalVideos: number;
  totalPlays: number;
  topVideos: MusicVideoSummary[];
  latestVideos: MusicVideoSummary[];
}

export interface MusicPlaylistSummary {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  isCurated: boolean;
  curatedSlug: string | null;
  videoCount: number;
  userId: string;
}

export interface MusicFeaturedSections {
  trending: MusicVideoSummary[]; // weeklyPlays desc, last 7 days
  newReleases: MusicVideoSummary[]; // publishedAt desc, last 30 days
  artistSpotlight: MusicVideoSummary[]; // curated — hand-picked by admin
  replayLoop: MusicVideoSummary[]; // highest replay rate (playCount/viewCount)
  genreTakeover: { genre: MusicGenre; videos: MusicVideoSummary[] } | null;
}

export interface MusicPlaylistItem {
  id: string;
  playlistId: string;
  musicId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  music?: MusicVideo;
}

export interface MusicPlaylist extends MusicPlaylistSummary {
  createdAt: string;
  updatedAt: string;
  items: MusicPlaylistItem[];
}
