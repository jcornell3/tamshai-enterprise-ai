// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'keycloak_config.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$KeycloakConfigImpl _$$KeycloakConfigImplFromJson(Map<String, dynamic> json) =>
    _$KeycloakConfigImpl(
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

Map<String, dynamic> _$$KeycloakConfigImplToJson(
  _$KeycloakConfigImpl instance,
) => <String, dynamic>{
  'issuer': instance.issuer,
  'clientId': instance.clientId,
  'redirectUrl': instance.redirectUrl,
  'scopes': instance.scopes,
  'discoveryUrl': instance.discoveryUrl,
  'endSessionRedirectUrl': instance.endSessionRedirectUrl,
};
