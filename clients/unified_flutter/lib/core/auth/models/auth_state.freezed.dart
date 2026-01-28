// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'auth_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$AuthState {





@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AuthState);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'AuthState()';
}


}

/// @nodoc
class $AuthStateCopyWith<$Res>  {
$AuthStateCopyWith(AuthState _, $Res Function(AuthState) __);
}


/// Adds pattern-matching-related methods to [AuthState].
extension AuthStatePatterns on AuthState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>({TResult Function( Unauthenticated value)?  unauthenticated,TResult Function( Authenticating value)?  authenticating,TResult Function( Authenticated value)?  authenticated,TResult Function( AuthError value)?  error,required TResult orElse(),}){
final _that = this;
switch (_that) {
case Unauthenticated() when unauthenticated != null:
return unauthenticated(_that);case Authenticating() when authenticating != null:
return authenticating(_that);case Authenticated() when authenticated != null:
return authenticated(_that);case AuthError() when error != null:
return error(_that);case _:
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

@optionalTypeArgs TResult map<TResult extends Object?>({required TResult Function( Unauthenticated value)  unauthenticated,required TResult Function( Authenticating value)  authenticating,required TResult Function( Authenticated value)  authenticated,required TResult Function( AuthError value)  error,}){
final _that = this;
switch (_that) {
case Unauthenticated():
return unauthenticated(_that);case Authenticating():
return authenticating(_that);case Authenticated():
return authenticated(_that);case AuthError():
return error(_that);}
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>({TResult? Function( Unauthenticated value)?  unauthenticated,TResult? Function( Authenticating value)?  authenticating,TResult? Function( Authenticated value)?  authenticated,TResult? Function( AuthError value)?  error,}){
final _that = this;
switch (_that) {
case Unauthenticated() when unauthenticated != null:
return unauthenticated(_that);case Authenticating() when authenticating != null:
return authenticating(_that);case Authenticated() when authenticated != null:
return authenticated(_that);case AuthError() when error != null:
return error(_that);case _:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>({TResult Function()?  unauthenticated,TResult Function()?  authenticating,TResult Function( AuthUser user)?  authenticated,TResult Function( String message)?  error,required TResult orElse(),}) {final _that = this;
switch (_that) {
case Unauthenticated() when unauthenticated != null:
return unauthenticated();case Authenticating() when authenticating != null:
return authenticating();case Authenticated() when authenticated != null:
return authenticated(_that.user);case AuthError() when error != null:
return error(_that.message);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>({required TResult Function()  unauthenticated,required TResult Function()  authenticating,required TResult Function( AuthUser user)  authenticated,required TResult Function( String message)  error,}) {final _that = this;
switch (_that) {
case Unauthenticated():
return unauthenticated();case Authenticating():
return authenticating();case Authenticated():
return authenticated(_that.user);case AuthError():
return error(_that.message);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>({TResult? Function()?  unauthenticated,TResult? Function()?  authenticating,TResult? Function( AuthUser user)?  authenticated,TResult? Function( String message)?  error,}) {final _that = this;
switch (_that) {
case Unauthenticated() when unauthenticated != null:
return unauthenticated();case Authenticating() when authenticating != null:
return authenticating();case Authenticated() when authenticated != null:
return authenticated(_that.user);case AuthError() when error != null:
return error(_that.message);case _:
  return null;

}
}

}

/// @nodoc


class Unauthenticated implements AuthState {
  const Unauthenticated();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Unauthenticated);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'AuthState.unauthenticated()';
}


}




/// @nodoc


class Authenticating implements AuthState {
  const Authenticating();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Authenticating);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'AuthState.authenticating()';
}


}




/// @nodoc


class Authenticated implements AuthState {
  const Authenticated(this.user);
  

 final  AuthUser user;

/// Create a copy of AuthState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AuthenticatedCopyWith<Authenticated> get copyWith => _$AuthenticatedCopyWithImpl<Authenticated>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Authenticated&&(identical(other.user, user) || other.user == user));
}


@override
int get hashCode => Object.hash(runtimeType,user);

@override
String toString() {
  return 'AuthState.authenticated(user: $user)';
}


}

/// @nodoc
abstract mixin class $AuthenticatedCopyWith<$Res> implements $AuthStateCopyWith<$Res> {
  factory $AuthenticatedCopyWith(Authenticated value, $Res Function(Authenticated) _then) = _$AuthenticatedCopyWithImpl;
@useResult
$Res call({
 AuthUser user
});


$AuthUserCopyWith<$Res> get user;

}
/// @nodoc
class _$AuthenticatedCopyWithImpl<$Res>
    implements $AuthenticatedCopyWith<$Res> {
  _$AuthenticatedCopyWithImpl(this._self, this._then);

  final Authenticated _self;
  final $Res Function(Authenticated) _then;

/// Create a copy of AuthState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? user = null,}) {
  return _then(Authenticated(
null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as AuthUser,
  ));
}

/// Create a copy of AuthState
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$AuthUserCopyWith<$Res> get user {
  
  return $AuthUserCopyWith<$Res>(_self.user, (value) {
    return _then(_self.copyWith(user: value));
  });
}
}

/// @nodoc


class AuthError implements AuthState {
  const AuthError(this.message);
  

 final  String message;

/// Create a copy of AuthState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AuthErrorCopyWith<AuthError> get copyWith => _$AuthErrorCopyWithImpl<AuthError>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AuthError&&(identical(other.message, message) || other.message == message));
}


@override
int get hashCode => Object.hash(runtimeType,message);

@override
String toString() {
  return 'AuthState.error(message: $message)';
}


}

/// @nodoc
abstract mixin class $AuthErrorCopyWith<$Res> implements $AuthStateCopyWith<$Res> {
  factory $AuthErrorCopyWith(AuthError value, $Res Function(AuthError) _then) = _$AuthErrorCopyWithImpl;
@useResult
$Res call({
 String message
});




}
/// @nodoc
class _$AuthErrorCopyWithImpl<$Res>
    implements $AuthErrorCopyWith<$Res> {
  _$AuthErrorCopyWithImpl(this._self, this._then);

  final AuthError _self;
  final $Res Function(AuthError) _then;

/// Create a copy of AuthState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? message = null,}) {
  return _then(AuthError(
null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$AuthUser {

 String get id; String get username; String? get email; String? get firstName; String? get lastName; String? get fullName; List<String>? get roles; Map<String, dynamic>? get attributes;
/// Create a copy of AuthUser
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AuthUserCopyWith<AuthUser> get copyWith => _$AuthUserCopyWithImpl<AuthUser>(this as AuthUser, _$identity);

  /// Serializes this AuthUser to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AuthUser&&(identical(other.id, id) || other.id == id)&&(identical(other.username, username) || other.username == username)&&(identical(other.email, email) || other.email == email)&&(identical(other.firstName, firstName) || other.firstName == firstName)&&(identical(other.lastName, lastName) || other.lastName == lastName)&&(identical(other.fullName, fullName) || other.fullName == fullName)&&const DeepCollectionEquality().equals(other.roles, roles)&&const DeepCollectionEquality().equals(other.attributes, attributes));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,username,email,firstName,lastName,fullName,const DeepCollectionEquality().hash(roles),const DeepCollectionEquality().hash(attributes));

@override
String toString() {
  return 'AuthUser(id: $id, username: $username, email: $email, firstName: $firstName, lastName: $lastName, fullName: $fullName, roles: $roles, attributes: $attributes)';
}


}

/// @nodoc
abstract mixin class $AuthUserCopyWith<$Res>  {
  factory $AuthUserCopyWith(AuthUser value, $Res Function(AuthUser) _then) = _$AuthUserCopyWithImpl;
@useResult
$Res call({
 String id, String username, String? email, String? firstName, String? lastName, String? fullName, List<String>? roles, Map<String, dynamic>? attributes
});




}
/// @nodoc
class _$AuthUserCopyWithImpl<$Res>
    implements $AuthUserCopyWith<$Res> {
  _$AuthUserCopyWithImpl(this._self, this._then);

  final AuthUser _self;
  final $Res Function(AuthUser) _then;

/// Create a copy of AuthUser
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? username = null,Object? email = freezed,Object? firstName = freezed,Object? lastName = freezed,Object? fullName = freezed,Object? roles = freezed,Object? attributes = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,username: null == username ? _self.username : username // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,firstName: freezed == firstName ? _self.firstName : firstName // ignore: cast_nullable_to_non_nullable
as String?,lastName: freezed == lastName ? _self.lastName : lastName // ignore: cast_nullable_to_non_nullable
as String?,fullName: freezed == fullName ? _self.fullName : fullName // ignore: cast_nullable_to_non_nullable
as String?,roles: freezed == roles ? _self.roles : roles // ignore: cast_nullable_to_non_nullable
as List<String>?,attributes: freezed == attributes ? _self.attributes : attributes // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}

}


/// Adds pattern-matching-related methods to [AuthUser].
extension AuthUserPatterns on AuthUser {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AuthUser value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AuthUser() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AuthUser value)  $default,){
final _that = this;
switch (_that) {
case _AuthUser():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AuthUser value)?  $default,){
final _that = this;
switch (_that) {
case _AuthUser() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String username,  String? email,  String? firstName,  String? lastName,  String? fullName,  List<String>? roles,  Map<String, dynamic>? attributes)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AuthUser() when $default != null:
return $default(_that.id,_that.username,_that.email,_that.firstName,_that.lastName,_that.fullName,_that.roles,_that.attributes);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String username,  String? email,  String? firstName,  String? lastName,  String? fullName,  List<String>? roles,  Map<String, dynamic>? attributes)  $default,) {final _that = this;
switch (_that) {
case _AuthUser():
return $default(_that.id,_that.username,_that.email,_that.firstName,_that.lastName,_that.fullName,_that.roles,_that.attributes);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String username,  String? email,  String? firstName,  String? lastName,  String? fullName,  List<String>? roles,  Map<String, dynamic>? attributes)?  $default,) {final _that = this;
switch (_that) {
case _AuthUser() when $default != null:
return $default(_that.id,_that.username,_that.email,_that.firstName,_that.lastName,_that.fullName,_that.roles,_that.attributes);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _AuthUser implements AuthUser {
  const _AuthUser({required this.id, required this.username, this.email, this.firstName, this.lastName, this.fullName, final  List<String>? roles, final  Map<String, dynamic>? attributes}): _roles = roles,_attributes = attributes;
  factory _AuthUser.fromJson(Map<String, dynamic> json) => _$AuthUserFromJson(json);

@override final  String id;
@override final  String username;
@override final  String? email;
@override final  String? firstName;
@override final  String? lastName;
@override final  String? fullName;
 final  List<String>? _roles;
@override List<String>? get roles {
  final value = _roles;
  if (value == null) return null;
  if (_roles is EqualUnmodifiableListView) return _roles;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(value);
}

 final  Map<String, dynamic>? _attributes;
@override Map<String, dynamic>? get attributes {
  final value = _attributes;
  if (value == null) return null;
  if (_attributes is EqualUnmodifiableMapView) return _attributes;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}


/// Create a copy of AuthUser
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AuthUserCopyWith<_AuthUser> get copyWith => __$AuthUserCopyWithImpl<_AuthUser>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AuthUserToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AuthUser&&(identical(other.id, id) || other.id == id)&&(identical(other.username, username) || other.username == username)&&(identical(other.email, email) || other.email == email)&&(identical(other.firstName, firstName) || other.firstName == firstName)&&(identical(other.lastName, lastName) || other.lastName == lastName)&&(identical(other.fullName, fullName) || other.fullName == fullName)&&const DeepCollectionEquality().equals(other._roles, _roles)&&const DeepCollectionEquality().equals(other._attributes, _attributes));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,username,email,firstName,lastName,fullName,const DeepCollectionEquality().hash(_roles),const DeepCollectionEquality().hash(_attributes));

@override
String toString() {
  return 'AuthUser(id: $id, username: $username, email: $email, firstName: $firstName, lastName: $lastName, fullName: $fullName, roles: $roles, attributes: $attributes)';
}


}

/// @nodoc
abstract mixin class _$AuthUserCopyWith<$Res> implements $AuthUserCopyWith<$Res> {
  factory _$AuthUserCopyWith(_AuthUser value, $Res Function(_AuthUser) _then) = __$AuthUserCopyWithImpl;
@override @useResult
$Res call({
 String id, String username, String? email, String? firstName, String? lastName, String? fullName, List<String>? roles, Map<String, dynamic>? attributes
});




}
/// @nodoc
class __$AuthUserCopyWithImpl<$Res>
    implements _$AuthUserCopyWith<$Res> {
  __$AuthUserCopyWithImpl(this._self, this._then);

  final _AuthUser _self;
  final $Res Function(_AuthUser) _then;

/// Create a copy of AuthUser
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? username = null,Object? email = freezed,Object? firstName = freezed,Object? lastName = freezed,Object? fullName = freezed,Object? roles = freezed,Object? attributes = freezed,}) {
  return _then(_AuthUser(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,username: null == username ? _self.username : username // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,firstName: freezed == firstName ? _self.firstName : firstName // ignore: cast_nullable_to_non_nullable
as String?,lastName: freezed == lastName ? _self.lastName : lastName // ignore: cast_nullable_to_non_nullable
as String?,fullName: freezed == fullName ? _self.fullName : fullName // ignore: cast_nullable_to_non_nullable
as String?,roles: freezed == roles ? _self._roles : roles // ignore: cast_nullable_to_non_nullable
as List<String>?,attributes: freezed == attributes ? _self._attributes : attributes // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}


}


/// @nodoc
mixin _$StoredTokens {

 String get accessToken; String get idToken; String? get refreshToken; DateTime get accessTokenExpirationDateTime; Map<String, dynamic>? get idTokenClaims;
/// Create a copy of StoredTokens
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$StoredTokensCopyWith<StoredTokens> get copyWith => _$StoredTokensCopyWithImpl<StoredTokens>(this as StoredTokens, _$identity);

  /// Serializes this StoredTokens to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is StoredTokens&&(identical(other.accessToken, accessToken) || other.accessToken == accessToken)&&(identical(other.idToken, idToken) || other.idToken == idToken)&&(identical(other.refreshToken, refreshToken) || other.refreshToken == refreshToken)&&(identical(other.accessTokenExpirationDateTime, accessTokenExpirationDateTime) || other.accessTokenExpirationDateTime == accessTokenExpirationDateTime)&&const DeepCollectionEquality().equals(other.idTokenClaims, idTokenClaims));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,accessToken,idToken,refreshToken,accessTokenExpirationDateTime,const DeepCollectionEquality().hash(idTokenClaims));

@override
String toString() {
  return 'StoredTokens(accessToken: $accessToken, idToken: $idToken, refreshToken: $refreshToken, accessTokenExpirationDateTime: $accessTokenExpirationDateTime, idTokenClaims: $idTokenClaims)';
}


}

/// @nodoc
abstract mixin class $StoredTokensCopyWith<$Res>  {
  factory $StoredTokensCopyWith(StoredTokens value, $Res Function(StoredTokens) _then) = _$StoredTokensCopyWithImpl;
@useResult
$Res call({
 String accessToken, String idToken, String? refreshToken, DateTime accessTokenExpirationDateTime, Map<String, dynamic>? idTokenClaims
});




}
/// @nodoc
class _$StoredTokensCopyWithImpl<$Res>
    implements $StoredTokensCopyWith<$Res> {
  _$StoredTokensCopyWithImpl(this._self, this._then);

  final StoredTokens _self;
  final $Res Function(StoredTokens) _then;

/// Create a copy of StoredTokens
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? accessToken = null,Object? idToken = null,Object? refreshToken = freezed,Object? accessTokenExpirationDateTime = null,Object? idTokenClaims = freezed,}) {
  return _then(_self.copyWith(
accessToken: null == accessToken ? _self.accessToken : accessToken // ignore: cast_nullable_to_non_nullable
as String,idToken: null == idToken ? _self.idToken : idToken // ignore: cast_nullable_to_non_nullable
as String,refreshToken: freezed == refreshToken ? _self.refreshToken : refreshToken // ignore: cast_nullable_to_non_nullable
as String?,accessTokenExpirationDateTime: null == accessTokenExpirationDateTime ? _self.accessTokenExpirationDateTime : accessTokenExpirationDateTime // ignore: cast_nullable_to_non_nullable
as DateTime,idTokenClaims: freezed == idTokenClaims ? _self.idTokenClaims : idTokenClaims // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}

}


/// Adds pattern-matching-related methods to [StoredTokens].
extension StoredTokensPatterns on StoredTokens {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _StoredTokens value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _StoredTokens() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _StoredTokens value)  $default,){
final _that = this;
switch (_that) {
case _StoredTokens():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _StoredTokens value)?  $default,){
final _that = this;
switch (_that) {
case _StoredTokens() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String accessToken,  String idToken,  String? refreshToken,  DateTime accessTokenExpirationDateTime,  Map<String, dynamic>? idTokenClaims)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _StoredTokens() when $default != null:
return $default(_that.accessToken,_that.idToken,_that.refreshToken,_that.accessTokenExpirationDateTime,_that.idTokenClaims);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String accessToken,  String idToken,  String? refreshToken,  DateTime accessTokenExpirationDateTime,  Map<String, dynamic>? idTokenClaims)  $default,) {final _that = this;
switch (_that) {
case _StoredTokens():
return $default(_that.accessToken,_that.idToken,_that.refreshToken,_that.accessTokenExpirationDateTime,_that.idTokenClaims);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String accessToken,  String idToken,  String? refreshToken,  DateTime accessTokenExpirationDateTime,  Map<String, dynamic>? idTokenClaims)?  $default,) {final _that = this;
switch (_that) {
case _StoredTokens() when $default != null:
return $default(_that.accessToken,_that.idToken,_that.refreshToken,_that.accessTokenExpirationDateTime,_that.idTokenClaims);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _StoredTokens implements StoredTokens {
  const _StoredTokens({required this.accessToken, required this.idToken, this.refreshToken, required this.accessTokenExpirationDateTime, final  Map<String, dynamic>? idTokenClaims}): _idTokenClaims = idTokenClaims;
  factory _StoredTokens.fromJson(Map<String, dynamic> json) => _$StoredTokensFromJson(json);

@override final  String accessToken;
@override final  String idToken;
@override final  String? refreshToken;
@override final  DateTime accessTokenExpirationDateTime;
 final  Map<String, dynamic>? _idTokenClaims;
@override Map<String, dynamic>? get idTokenClaims {
  final value = _idTokenClaims;
  if (value == null) return null;
  if (_idTokenClaims is EqualUnmodifiableMapView) return _idTokenClaims;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}


/// Create a copy of StoredTokens
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$StoredTokensCopyWith<_StoredTokens> get copyWith => __$StoredTokensCopyWithImpl<_StoredTokens>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$StoredTokensToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _StoredTokens&&(identical(other.accessToken, accessToken) || other.accessToken == accessToken)&&(identical(other.idToken, idToken) || other.idToken == idToken)&&(identical(other.refreshToken, refreshToken) || other.refreshToken == refreshToken)&&(identical(other.accessTokenExpirationDateTime, accessTokenExpirationDateTime) || other.accessTokenExpirationDateTime == accessTokenExpirationDateTime)&&const DeepCollectionEquality().equals(other._idTokenClaims, _idTokenClaims));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,accessToken,idToken,refreshToken,accessTokenExpirationDateTime,const DeepCollectionEquality().hash(_idTokenClaims));

@override
String toString() {
  return 'StoredTokens(accessToken: $accessToken, idToken: $idToken, refreshToken: $refreshToken, accessTokenExpirationDateTime: $accessTokenExpirationDateTime, idTokenClaims: $idTokenClaims)';
}


}

/// @nodoc
abstract mixin class _$StoredTokensCopyWith<$Res> implements $StoredTokensCopyWith<$Res> {
  factory _$StoredTokensCopyWith(_StoredTokens value, $Res Function(_StoredTokens) _then) = __$StoredTokensCopyWithImpl;
@override @useResult
$Res call({
 String accessToken, String idToken, String? refreshToken, DateTime accessTokenExpirationDateTime, Map<String, dynamic>? idTokenClaims
});




}
/// @nodoc
class __$StoredTokensCopyWithImpl<$Res>
    implements _$StoredTokensCopyWith<$Res> {
  __$StoredTokensCopyWithImpl(this._self, this._then);

  final _StoredTokens _self;
  final $Res Function(_StoredTokens) _then;

/// Create a copy of StoredTokens
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? accessToken = null,Object? idToken = null,Object? refreshToken = freezed,Object? accessTokenExpirationDateTime = null,Object? idTokenClaims = freezed,}) {
  return _then(_StoredTokens(
accessToken: null == accessToken ? _self.accessToken : accessToken // ignore: cast_nullable_to_non_nullable
as String,idToken: null == idToken ? _self.idToken : idToken // ignore: cast_nullable_to_non_nullable
as String,refreshToken: freezed == refreshToken ? _self.refreshToken : refreshToken // ignore: cast_nullable_to_non_nullable
as String?,accessTokenExpirationDateTime: null == accessTokenExpirationDateTime ? _self.accessTokenExpirationDateTime : accessTokenExpirationDateTime // ignore: cast_nullable_to_non_nullable
as DateTime,idTokenClaims: freezed == idTokenClaims ? _self._idTokenClaims : idTokenClaims // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}


}

// dart format on
