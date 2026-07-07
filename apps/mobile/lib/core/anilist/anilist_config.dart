const anilistClientId = String.fromEnvironment('ANILIST_CLIENT_ID');

const anilistRedirectUri = 'naijaspride://anilist-callback';

String buildAniListAuthorizeUrl() {
  return 'https://anilist.co/api/v2/oauth/authorize'
      '?client_id=$anilistClientId'
      '&redirect_uri=$anilistRedirectUri'
      '&response_type=code';
}
