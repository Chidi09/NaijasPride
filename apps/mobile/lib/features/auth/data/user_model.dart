class User {
  final String id;
  final String email;
  final String? name;
  final String role;
  final bool isPremium;
  final bool isGuest;
  final bool emailVerified;
  final Map<String, dynamic> raw;

  User({
    required this.id,
    required this.email,
    this.name,
    required this.role,
    required this.isPremium,
    required this.isGuest,
    required this.emailVerified,
    required this.raw,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      email: json['email'] as String,
      name: json['name'] as String?,
      role: json['role'] as String? ?? 'user',
      isPremium: json['isPremium'] as bool? ?? false,
      isGuest: json['isGuest'] as bool? ?? false,
      emailVerified: json['emailVerified'] as bool? ?? false,
      raw: json,
    );
  }

  Map<String, dynamic> toJson() => raw;
}
