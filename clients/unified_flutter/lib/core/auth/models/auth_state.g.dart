// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$AuthUserImpl _$$AuthUserImplFromJson(Map<String, dynamic> json) =>
    _$AuthUserImpl(
      id: json['id'] as String,
      username: json['username'] as String,
      email: json['email'] as String?,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      fullName: json['fullName'] as String?,
      roles: (json['roles'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      attributes: json['attributes'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$$AuthUserImplToJson(_$AuthUserImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'username': instance.username,
      'email': instance.email,
      'firstName': instance.firstName,
      'lastName': instance.lastName,
      'fullName': instance.fullName,
      'roles': instance.roles,
      'attributes': instance.attributes,
    };

_$StoredTokensImpl _$$StoredTokensImplFromJson(Map<String, dynamic> json) =>
    _$StoredTokensImpl(
      accessToken: json['accessToken'] as String,
      idToken: json['idToken'] as String,
      refreshToken: json['refreshToken'] as String?,
      accessTokenExpirationDateTime: DateTime.parse(
        json['accessTokenExpirationDateTime'] as String,
      ),
      idTokenClaims: json['idTokenClaims'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$$StoredTokensImplToJson(_$StoredTokensImpl instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'idToken': instance.idToken,
      'refreshToken': instance.refreshToken,
      'accessTokenExpirationDateTime': instance.accessTokenExpirationDateTime
          .toIso8601String(),
      'idTokenClaims': instance.idTokenClaims,
    };
