// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AuthUser _$AuthUserFromJson(Map<String, dynamic> json) => _AuthUser(
  id: json['id'] as String,
  username: json['username'] as String,
  email: json['email'] as String?,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  fullName: json['fullName'] as String?,
  roles: (json['roles'] as List<dynamic>?)?.map((e) => e as String).toList(),
  attributes: json['attributes'] as Map<String, dynamic>?,
);

Map<String, dynamic> _$AuthUserToJson(_AuthUser instance) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'email': instance.email,
  'firstName': instance.firstName,
  'lastName': instance.lastName,
  'fullName': instance.fullName,
  'roles': instance.roles,
  'attributes': instance.attributes,
};

_StoredTokens _$StoredTokensFromJson(Map<String, dynamic> json) =>
    _StoredTokens(
      accessToken: json['accessToken'] as String,
      idToken: json['idToken'] as String,
      refreshToken: json['refreshToken'] as String?,
      accessTokenExpirationDateTime: DateTime.parse(
        json['accessTokenExpirationDateTime'] as String,
      ),
      idTokenClaims: json['idTokenClaims'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$StoredTokensToJson(_StoredTokens instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'idToken': instance.idToken,
      'refreshToken': instance.refreshToken,
      'accessTokenExpirationDateTime': instance.accessTokenExpirationDateTime
          .toIso8601String(),
      'idTokenClaims': instance.idTokenClaims,
    };
