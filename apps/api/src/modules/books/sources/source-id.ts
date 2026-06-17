export type ParsedSourceEntityId = {
  sourceId: string;
  rawId: string;
};

export const buildSourceEntityId = (
  sourceId: string,
  rawId: string,
): string => {
  return `${sourceId}:${encodeURIComponent(rawId)}`;
};

export const parseSourceEntityId = (
  entityId: string,
): ParsedSourceEntityId | null => {
  const separatorIndex = entityId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === entityId.length - 1) {
    return null;
  }

  const sourceId = entityId.slice(0, separatorIndex).trim();
  const encodedRawId = entityId.slice(separatorIndex + 1).trim();
  if (!sourceId || !encodedRawId) return null;

  try {
    return {
      sourceId,
      rawId: decodeURIComponent(encodedRawId),
    };
  } catch {
    return null;
  }
};
