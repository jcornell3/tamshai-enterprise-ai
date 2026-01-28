// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'keycloak_config.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_KeycloakConfig _$KeycloakConfigFromJson(Map<String, dynamic> json) =>
    _KeycloakConfig(
      issuer: json['issuer'] as String,
      clientId: json['clientId'] as String,
      redirectUrl: json['redirectUrl'] as String,
      scopes:
          (json['scopes'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const ['openid', 'profile', 'email', 'offline_access'],
      discoveryUrl: json['discoveryUrl'] as String?,
      endSessionRedirectUrl: json['endSessionRedirectUrl'] as String?,
    );

Map<String, dynamic> _$KeycloakConfigToJson(_KeycloakConfig instance) =>
    <String, dynamic>{
      'issuer': instance.issuer,
      'clientId': instance.clientId,
      'redirectUrl': instance.redirectUrl,
      'scopes': instance.scopes,
      'discoveryUrl': instance.discoveryUrl,
      'endSessionRedirectUrl': instance.endSessionRedirectUrl,
    };
