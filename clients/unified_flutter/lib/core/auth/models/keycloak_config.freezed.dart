// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'keycloak_config.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$KeycloakConfig {

 String get issuer; String get clientId; String get redirectUrl; List<String> get scopes; String? get discoveryUrl; String? get endSessionRedirectUrl;
/// Create a copy of KeycloakConfig
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$KeycloakConfigCopyWith<KeycloakConfig> get copyWith => _$KeycloakConfigCopyWithImpl<KeycloakConfig>(this as KeycloakConfig, _$identity);

  /// Serializes this KeycloakConfig to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is KeycloakConfig&&(identical(other.issuer, issuer) || other.issuer == issuer)&&(identical(other.clientId, clientId) || other.clientId == clientId)&&(identical(other.redirectUrl, redirectUrl) || other.redirectUrl == redirectUrl)&&const DeepCollectionEquality().equals(other.scopes, scopes)&&(identical(other.discoveryUrl, discoveryUrl) || other.discoveryUrl == discoveryUrl)&&(identical(other.endSessionRedirectUrl, endSessionRedirectUrl) || other.endSessionRedirectUrl == endSessionRedirectUrl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,issuer,clientId,redirectUrl,const DeepCollectionEquality().hash(scopes),discoveryUrl,endSessionRedirectUrl);

@override
String toString() {
  return 'KeycloakConfig(issuer: $issuer, clientId: $clientId, redirectUrl: $redirectUrl, scopes: $scopes, discoveryUrl: $discoveryUrl, endSessionRedirectUrl: $endSessionRedirectUrl)';
}


}

/// @nodoc
abstract mixin class $KeycloakConfigCopyWith<$Res>  {
  factory $KeycloakConfigCopyWith(KeycloakConfig value, $Res Function(KeycloakConfig) _then) = _$KeycloakConfigCopyWithImpl;
@useResult
$Res call({
 String issuer, String clientId, String redirectUrl, List<String> scopes, String? discoveryUrl, String? endSessionRedirectUrl
});




}
/// @nodoc
class _$KeycloakConfigCopyWithImpl<$Res>
    implements $KeycloakConfigCopyWith<$Res> {
  _$KeycloakConfigCopyWithImpl(this._self, this._then);

  final KeycloakConfig _self;
  final $Res Function(KeycloakConfig) _then;

/// Create a copy of KeycloakConfig
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? issuer = null,Object? clientId = null,Object? redirectUrl = null,Object? scopes = null,Object? discoveryUrl = freezed,Object? endSessionRedirectUrl = freezed,}) {
  return _then(_self.copyWith(
issuer: null == issuer ? _self.issuer : issuer // ignore: cast_nullable_to_non_nullable
as String,clientId: null == clientId ? _self.clientId : clientId // ignore: cast_nullable_to_non_nullable
as String,redirectUrl: null == redirectUrl ? _self.redirectUrl : redirectUrl // ignore: cast_nullable_to_non_nullable
as String,scopes: null == scopes ? _self.scopes : scopes // ignore: cast_nullable_to_non_nullable
as List<String>,discoveryUrl: freezed == discoveryUrl ? _self.discoveryUrl : discoveryUrl // ignore: cast_nullable_to_non_nullable
as String?,endSessionRedirectUrl: freezed == endSessionRedirectUrl ? _self.endSessionRedirectUrl : endSessionRedirectUrl // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [KeycloakConfig].
extension KeycloakConfigPatterns on KeycloakConfig {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _KeycloakConfig value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _KeycloakConfig() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _KeycloakConfig value)  $default,){
final _that = this;
switch (_that) {
case _KeycloakConfig():
return $default(_that);}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _KeycloakConfig value)?  $default,){
final _that = this;
switch (_that) {
case _KeycloakConfig() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String issuer,  String clientId,  String redirectUrl,  List<String> scopes,  String? discoveryUrl,  String? endSessionRedirectUrl)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _KeycloakConfig() when $default != null:
return $default(_that.issuer,_that.clientId,_that.redirectUrl,_that.scopes,_that.discoveryUrl,_that.endSessionRedirectUrl);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String issuer,  String clientId,  String redirectUrl,  List<String> scopes,  String? discoveryUrl,  String? endSessionRedirectUrl)  $default,) {final _that = this;
switch (_that) {
case _KeycloakConfig():
return $default(_that.issuer,_that.clientId,_that.redirectUrl,_that.scopes,_that.discoveryUrl,_that.endSessionRedirectUrl);}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String issuer,  String clientId,  String redirectUrl,  List<String> scopes,  String? discoveryUrl,  String? endSessionRedirectUrl)?  $default,) {final _that = this;
switch (_that) {
case _KeycloakConfig() when $default != null:
return $default(_that.issuer,_that.clientId,_that.redirectUrl,_that.scopes,_that.discoveryUrl,_that.endSessionRedirectUrl);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _KeycloakConfig implements KeycloakConfig {
  const _KeycloakConfig({required this.issuer, required this.clientId, required this.redirectUrl, final  List<String> scopes = const ['openid', 'profile', 'email', 'offline_access'], this.discoveryUrl, this.endSessionRedirectUrl}): _scopes = scopes;
  factory _KeycloakConfig.fromJson(Map<String, dynamic> json) => _$KeycloakConfigFromJson(json);

@override final  String issuer;
@override final  String clientId;
@override final  String redirectUrl;
 final  List<String> _scopes;
@override@JsonKey() List<String> get scopes {
  if (_scopes is EqualUnmodifiableListView) return _scopes;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_scopes);
}

@override final  String? discoveryUrl;
@override final  String? endSessionRedirectUrl;

/// Create a copy of KeycloakConfig
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$KeycloakConfigCopyWith<_KeycloakConfig> get copyWith => __$KeycloakConfigCopyWithImpl<_KeycloakConfig>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$KeycloakConfigToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _KeycloakConfig&&(identical(other.issuer, issuer) || other.issuer == issuer)&&(identical(other.clientId, clientId) || other.clientId == clientId)&&(identical(other.redirectUrl, redirectUrl) || other.redirectUrl == redirectUrl)&&const DeepCollectionEquality().equals(other._scopes, _scopes)&&(identical(other.discoveryUrl, discoveryUrl) || other.discoveryUrl == discoveryUrl)&&(identical(other.endSessionRedirectUrl, endSessionRedirectUrl) || other.endSessionRedirectUrl == endSessionRedirectUrl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,issuer,clientId,redirectUrl,const DeepCollectionEquality().hash(_scopes),discoveryUrl,endSessionRedirectUrl);

@override
String toString() {
  return 'KeycloakConfig(issuer: $issuer, clientId: $clientId, redirectUrl: $redirectUrl, scopes: $scopes, discoveryUrl: $discoveryUrl, endSessionRedirectUrl: $endSessionRedirectUrl)';
}


}

/// @nodoc
abstract mixin class _$KeycloakConfigCopyWith<$Res> implements $KeycloakConfigCopyWith<$Res> {
  factory _$KeycloakConfigCopyWith(_KeycloakConfig value, $Res Function(_KeycloakConfig) _then) = __$KeycloakConfigCopyWithImpl;
@override @useResult
$Res call({
 String issuer, String clientId, String redirectUrl, List<String> scopes, String? discoveryUrl, String? endSessionRedirectUrl
});




}
/// @nodoc
class __$KeycloakConfigCopyWithImpl<$Res>
    implements _$KeycloakConfigCopyWith<$Res> {
  __$KeycloakConfigCopyWithImpl(this._self, this._then);

  final _KeycloakConfig _self;
  final $Res Function(_KeycloakConfig) _then;

/// Create a copy of KeycloakConfig
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? issuer = null,Object? clientId = null,Object? redirectUrl = null,Object? scopes = null,Object? discoveryUrl = freezed,Object? endSessionRedirectUrl = freezed,}) {
  return _then(_KeycloakConfig(
issuer: null == issuer ? _self.issuer : issuer // ignore: cast_nullable_to_non_nullable
as String,clientId: null == clientId ? _self.clientId : clientId // ignore: cast_nullable_to_non_nullable
as String,redirectUrl: null == redirectUrl ? _self.redirectUrl : redirectUrl // ignore: cast_nullable_to_non_nullable
as String,scopes: null == scopes ? _self._scopes : scopes // ignore: cast_nullable_to_non_nullable
as List<String>,discoveryUrl: freezed == discoveryUrl ? _self.discoveryUrl : discoveryUrl // ignore: cast_nullable_to_non_nullable
as String?,endSessionRedirectUrl: freezed == endSessionRedirectUrl ? _self.endSessionRedirectUrl : endSessionRedirectUrl // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
