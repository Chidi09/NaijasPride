enum Genre {
  action,
  comedy,
  drama,
  romance,
  thriller,
  horror,
  documentary,
  nollywood,
  bollywood,
  hollywood,
  yoruba,
  igbo,
  hausa,
  animation,
  sciFi,
  family;

  String get wireValue {
    switch (this) {
      case Genre.sciFi:
        return 'Sci-Fi';
      default:
        return name[0].toUpperCase() + name.substring(1);
    }
  }

  static Genre fromWire(String value) {
    switch (value) {
      case 'Action':
        return Genre.action;
      case 'Comedy':
        return Genre.comedy;
      case 'Drama':
        return Genre.drama;
      case 'Romance':
        return Genre.romance;
      case 'Thriller':
        return Genre.thriller;
      case 'Horror':
        return Genre.horror;
      case 'Documentary':
        return Genre.documentary;
      case 'Nollywood':
        return Genre.nollywood;
      case 'Bollywood':
        return Genre.bollywood;
      case 'Hollywood':
        return Genre.hollywood;
      case 'Yoruba':
        return Genre.yoruba;
      case 'Igbo':
        return Genre.igbo;
      case 'Hausa':
        return Genre.hausa;
      case 'Animation':
        return Genre.animation;
      case 'Sci-Fi':
        return Genre.sciFi;
      case 'Family':
        return Genre.family;
      default:
        return Genre.action;
    }
  }
}

enum Quality {
  q480p,
  q720p,
  q1080p,
  q4k;

  String get wireValue {
    switch (this) {
      case Quality.q480p:
        return '480p';
      case Quality.q720p:
        return '720p';
      case Quality.q1080p:
        return '1080p';
      case Quality.q4k:
        return '4K';
    }
  }

  static Quality fromWire(String value) {
    switch (value) {
      case '480p':
        return Quality.q480p;
      case '720p':
        return Quality.q720p;
      case '1080p':
        return Quality.q1080p;
      case '4K':
        return Quality.q4k;
      default:
        return Quality.q720p;
    }
  }
}
