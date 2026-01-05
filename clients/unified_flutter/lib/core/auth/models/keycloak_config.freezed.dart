// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'keycloak_config.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

KeycloakConfig _$KeycloakConfigFromJson(Map<String, dynamic> json) {
  return _KeycloakConfig.fromJson(json);
}

/// @nodoc
mixin _$KeycloakConfig {
  String get issuer => throw _privateConstructorUsedError;
  String get clientId => throw _privateConstructorUsedError;
  String get redirectUrl => throw _privateConstructorUsedError;
  List<String> get scopes => throw _privateConstructorUsedError;
  String? get discoveryUrl => throw _privateConstructorUsedError;
  String? get endSessionRedirectUrl => throw _privateConstructorUsedError;

  /// Serializes this KeycloakConfig to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of KeycloakConfig
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $KeycloakConfigCopyWith<KeycloakConfig> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $KeycloakConfigCopyWith<$Res> {
  factory $KeycloakConfigCopyWith(
          KeycloakConfig value, $Res Function(KeycloakConfig) then) =
      _$KeycloakConfigCopyWithImpl<$Res, KeycloakConfig>;
  @useResult
  $Res call(
      {String issuer,
      String clientId,
      String redirectUrl,
      List<String> scopes,
      String? discoveryUrl,
      String? endSessionRedirectUrl});
}

/// @nodoc
class _$KeycloakConfigCopyWithImpl<$Res, $Val extends KeycloakConfig>
    implements $KeycloakConfigCopyWith<$Res> {
  _$KeycloakConfigCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of KeycloakConfig
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? issuer = null,
    Object? clientId = null,
    Object? redirectUrl = null,
    Object? scopes = null,
    Object? discoveryUrl = freezed,
    Object? endSessionRedirectUrl = freezed,
  }) {
    return _then(_value.copyWith(
      issuer: null == issuer
          ? _value.issuer
          : issuer // ignore: cast_nullable_to_non_nullable
              as String,
      clientId: null == clientId
          ? _value.clientId
          : clientId // ignore: cast_nullable_to_non_nullable
              as String,
      redirectUrl: null == redirectUrl
          ? _value.redirectUrl
          : redirectUrl // ignore: cast_nullable_to_non_nullable
              as String,
      scopes: null == scopes
          ? _value.scopes
          : scopes // ignore: cast_nullable_to_non_nullable
              as List<String>,
      discoveryUrl: freezed == discoveryUrl
          ? _value.discoveryUrl
          : discoveryUrl // ignore: cast_nullable_to_non_nullable
              as String?,
      endSessionRedirectUrl: freezed == endSessionRedirectUrl
          ? _value.endSessionRedirectUrl
          : endSessionRedirectUrl // ignore: cast_nullable_to_non_nullable
              as String?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$KeycloakConfigImplCopyWith<$Res>
    implements $KeycloakConfigCopyWith<$Res> {
  factory _$$KeycloakConfigImplCopyWith(_$KeycloakConfigImpl value,
          $Res Function(_$KeycloakConfigImpl) then) =
      __$$KeycloakConfigImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String issuer,
      String clientId,
      String redirectUrl,
      List<String> scopes,
      String? discoveryUrl,
      String? endSessionRedirectUrl});
}

/// @nodoc
class __$$KeycloakConfigImplCopyWithImpl<$Res>
    extends _$KeycloakConfigCopyWithImpl<$Res, _$KeycloakConfigImpl>
    implements _$$KeycloakConfigImplCopyWith<$Res> {
  __$$KeycloakConfigImplCopyWithImpl(
      _$KeycloakConfigImpl _value, $Res Function(_$KeycloakConfigImpl) _then)
      : super(_value, _then);

  /// Create a copy of KeycloakConfig
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? issuer = null,
    Object? clientId = null,
    Object? redirectUrl = null,
    Object? scopes = null,
    Object? discoveryUrl = freezed,
    Object? endSessionRedirectUrl = freezed,
  }) {
    return _then(_$KeycloakConfigImpl(
      issuer: null == issuer
          ? _value.issuer
          : issuer // ignore: cast_nullable_to_non_nullable
              as String,
      clientId: null == clientId
          ? _value.clientId
          : clientId // ignore: cast_nullable_to_non_nullable
              as String,
      redirectUrl: null == redirectUrl
          ? _value.redirectUrl
          : redirectUrl // ignore: cast_nullable_to_non_nullable
              as String,
      scopes: null == scopes
          ? _value._scopes
          : scopes // ignore: cast_nullable_to_non_nullable
              as List<String>,
      discoveryUrl: freezed == discoveryUrl
          ? _value.discoveryUrl
          : discoveryUrl // ignore: cast_nullable_to_non_nullable
              as String?,
      endSessionRedirectUrl: freezed == endSessionRedirectUrl
          ? _value.endSessionRedirectUrl
          : endSessionRedirectUrl // ignore: cast_nullable_to_non_nullable
              as String?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$KeycloakConfigImpl implements _KeycloakConfig {
  const _$KeycloakConfigImpl(
      {required this.issuer,
      required this.clientId,
      required this.redirectUrl,
      final List<String> scopes = const [
        'openid',
        'profile',
        'email',
        'offline_access'
      ],
      this.discoveryUrl,
      this.endSessionRedirectUrl})
      : _scopes = scopes;

  factory _$KeycloakConfigImpl.fromJson(Map<String, dynamic> json) =>
      _$$KeycloakConfigImplFromJson(json);

  @override
  final String issuer;
  @override
  final String clientId;
  @override
  final String redirectUrl;
  final List<String> _scopes;
  @override
  @JsonKey()
  List<String> get scopes {
    if (_scopes is EqualUnmodifiableListView) return _scopes;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_scopes);
  }

  @override
  final String? discoveryUrl;
  @override
  final String? endSessionRedirectUrl;

  @override
  String toString() {
    return 'KeycloakConfig(issuer: $issuer, clientId: $clientId, redirectUrl: $redirectUrl, scopes: $scopes, discoveryUrl: $discoveryUrl, endSessionRedirectUrl: $endSessionRedirectUrl)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$KeycloakConfigImpl &&
            (identical(other.issuer, issuer) || other.issuer == issuer) &&
            (identical(other.clientId, clientId) ||
                other.clientId == clientId) &&
            (identical(other.redirectUrl, redirectUrl) ||
                other.redirectUrl == redirectUrl) &&
            const DeepCollectionEquality().equals(other._scopes, _scopes) &&
            (identical(other.discoveryUrl, discoveryUrl) ||
                other.discoveryUrl == discoveryUrl) &&
            (identical(other.endSessionRedirectUrl, endSessionRedirectUrl) ||
                other.endSessionRedirectUrl == endSessionRedirectUrl));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      issuer,
      clientId,
      redirectUrl,
      const DeepCollectionEquality().hash(_scopes),
      discoveryUrl,
      endSessionRedirectUrl);

  /// Create a copy of KeycloakConfig
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$KeycloakConfigImplCopyWith<_$KeycloakConfigImpl> get copyWith =>
      __$$KeycloakConfigImplCopyWithImpl<_$KeycloakConfigImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$KeycloakConfigImplToJson(
      this,
    );
  }
}

abstract class _KeycloakConfig implements KeycloakConfig {
  const factory _KeycloakConfig(
      {required final String issuer,
      required final String clientId,
      required final String redirectUrl,
      final List<String> scopes,
      final String? discoveryUrl,
      final String? endSessionRedirectUrl}) = _$KeycloakConfigImpl;

  factory _KeycloakConfig.fromJson(Map<String, dynamic> json) =
      _$KeycloakConfigImpl.fromJson;

  @override
  String get issuer;
  @override
  String get clientId;
  @override
  String get redirectUrl;
  @override
  List<String> get scopes;
  @override
  String? get discoveryUrl;
  @override
  String? get endSessionRedirectUrl;

  /// Create a copy of KeycloakConfig
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$KeycloakConfigImplCopyWith<_$KeycloakConfigImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
