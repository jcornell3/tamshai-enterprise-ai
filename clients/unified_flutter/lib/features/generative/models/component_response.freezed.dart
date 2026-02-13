// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'component_response.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ComponentResponse {

/// Component type identifier (e.g., 'OrgChartComponent', 'ApprovalsQueue')
 String get type;/// Component-specific props/data
 Map<String, dynamic> get props;/// Available actions for this component
 List<ComponentAction> get actions;/// Voice narration for TTS
 Narration? get narration;/// Metadata about the response
 ComponentMetadata? get metadata;
/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ComponentResponseCopyWith<ComponentResponse> get copyWith => _$ComponentResponseCopyWithImpl<ComponentResponse>(this as ComponentResponse, _$identity);

  /// Serializes this ComponentResponse to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ComponentResponse&&(identical(other.type, type) || other.type == type)&&const DeepCollectionEquality().equals(other.props, props)&&const DeepCollectionEquality().equals(other.actions, actions)&&(identical(other.narration, narration) || other.narration == narration)&&(identical(other.metadata, metadata) || other.metadata == metadata));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,type,const DeepCollectionEquality().hash(props),const DeepCollectionEquality().hash(actions),narration,metadata);

@override
String toString() {
  return 'ComponentResponse(type: $type, props: $props, actions: $actions, narration: $narration, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class $ComponentResponseCopyWith<$Res>  {
  factory $ComponentResponseCopyWith(ComponentResponse value, $Res Function(ComponentResponse) _then) = _$ComponentResponseCopyWithImpl;
@useResult
$Res call({
 String type, Map<String, dynamic> props, List<ComponentAction> actions, Narration? narration, ComponentMetadata? metadata
});


$NarrationCopyWith<$Res>? get narration;$ComponentMetadataCopyWith<$Res>? get metadata;

}
/// @nodoc
class _$ComponentResponseCopyWithImpl<$Res>
    implements $ComponentResponseCopyWith<$Res> {
  _$ComponentResponseCopyWithImpl(this._self, this._then);

  final ComponentResponse _self;
  final $Res Function(ComponentResponse) _then;

/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? type = null,Object? props = null,Object? actions = null,Object? narration = freezed,Object? metadata = freezed,}) {
  return _then(_self.copyWith(
type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,props: null == props ? _self.props : props // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,actions: null == actions ? _self.actions : actions // ignore: cast_nullable_to_non_nullable
as List<ComponentAction>,narration: freezed == narration ? _self.narration : narration // ignore: cast_nullable_to_non_nullable
as Narration?,metadata: freezed == metadata ? _self.metadata : metadata // ignore: cast_nullable_to_non_nullable
as ComponentMetadata?,
  ));
}
/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$NarrationCopyWith<$Res>? get narration {
    if (_self.narration == null) {
    return null;
  }

  return $NarrationCopyWith<$Res>(_self.narration!, (value) {
    return _then(_self.copyWith(narration: value));
  });
}/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ComponentMetadataCopyWith<$Res>? get metadata {
    if (_self.metadata == null) {
    return null;
  }

  return $ComponentMetadataCopyWith<$Res>(_self.metadata!, (value) {
    return _then(_self.copyWith(metadata: value));
  });
}
}


/// Adds pattern-matching-related methods to [ComponentResponse].
extension ComponentResponsePatterns on ComponentResponse {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ComponentResponse value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ComponentResponse() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ComponentResponse value)  $default,){
final _that = this;
switch (_that) {
case _ComponentResponse():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ComponentResponse value)?  $default,){
final _that = this;
switch (_that) {
case _ComponentResponse() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String type,  Map<String, dynamic> props,  List<ComponentAction> actions,  Narration? narration,  ComponentMetadata? metadata)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ComponentResponse() when $default != null:
return $default(_that.type,_that.props,_that.actions,_that.narration,_that.metadata);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String type,  Map<String, dynamic> props,  List<ComponentAction> actions,  Narration? narration,  ComponentMetadata? metadata)  $default,) {final _that = this;
switch (_that) {
case _ComponentResponse():
return $default(_that.type,_that.props,_that.actions,_that.narration,_that.metadata);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String type,  Map<String, dynamic> props,  List<ComponentAction> actions,  Narration? narration,  ComponentMetadata? metadata)?  $default,) {final _that = this;
switch (_that) {
case _ComponentResponse() when $default != null:
return $default(_that.type,_that.props,_that.actions,_that.narration,_that.metadata);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ComponentResponse implements ComponentResponse {
  const _ComponentResponse({required this.type, required final  Map<String, dynamic> props, final  List<ComponentAction> actions = const [], this.narration, this.metadata}): _props = props,_actions = actions;
  factory _ComponentResponse.fromJson(Map<String, dynamic> json) => _$ComponentResponseFromJson(json);

/// Component type identifier (e.g., 'OrgChartComponent', 'ApprovalsQueue')
@override final  String type;
/// Component-specific props/data
 final  Map<String, dynamic> _props;
/// Component-specific props/data
@override Map<String, dynamic> get props {
  if (_props is EqualUnmodifiableMapView) return _props;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_props);
}

/// Available actions for this component
 final  List<ComponentAction> _actions;
/// Available actions for this component
@override@JsonKey() List<ComponentAction> get actions {
  if (_actions is EqualUnmodifiableListView) return _actions;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_actions);
}

/// Voice narration for TTS
@override final  Narration? narration;
/// Metadata about the response
@override final  ComponentMetadata? metadata;

/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ComponentResponseCopyWith<_ComponentResponse> get copyWith => __$ComponentResponseCopyWithImpl<_ComponentResponse>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ComponentResponseToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ComponentResponse&&(identical(other.type, type) || other.type == type)&&const DeepCollectionEquality().equals(other._props, _props)&&const DeepCollectionEquality().equals(other._actions, _actions)&&(identical(other.narration, narration) || other.narration == narration)&&(identical(other.metadata, metadata) || other.metadata == metadata));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,type,const DeepCollectionEquality().hash(_props),const DeepCollectionEquality().hash(_actions),narration,metadata);

@override
String toString() {
  return 'ComponentResponse(type: $type, props: $props, actions: $actions, narration: $narration, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class _$ComponentResponseCopyWith<$Res> implements $ComponentResponseCopyWith<$Res> {
  factory _$ComponentResponseCopyWith(_ComponentResponse value, $Res Function(_ComponentResponse) _then) = __$ComponentResponseCopyWithImpl;
@override @useResult
$Res call({
 String type, Map<String, dynamic> props, List<ComponentAction> actions, Narration? narration, ComponentMetadata? metadata
});


@override $NarrationCopyWith<$Res>? get narration;@override $ComponentMetadataCopyWith<$Res>? get metadata;

}
/// @nodoc
class __$ComponentResponseCopyWithImpl<$Res>
    implements _$ComponentResponseCopyWith<$Res> {
  __$ComponentResponseCopyWithImpl(this._self, this._then);

  final _ComponentResponse _self;
  final $Res Function(_ComponentResponse) _then;

/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? type = null,Object? props = null,Object? actions = null,Object? narration = freezed,Object? metadata = freezed,}) {
  return _then(_ComponentResponse(
type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,props: null == props ? _self._props : props // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,actions: null == actions ? _self._actions : actions // ignore: cast_nullable_to_non_nullable
as List<ComponentAction>,narration: freezed == narration ? _self.narration : narration // ignore: cast_nullable_to_non_nullable
as Narration?,metadata: freezed == metadata ? _self.metadata : metadata // ignore: cast_nullable_to_non_nullable
as ComponentMetadata?,
  ));
}

/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$NarrationCopyWith<$Res>? get narration {
    if (_self.narration == null) {
    return null;
  }

  return $NarrationCopyWith<$Res>(_self.narration!, (value) {
    return _then(_self.copyWith(narration: value));
  });
}/// Create a copy of ComponentResponse
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ComponentMetadataCopyWith<$Res>? get metadata {
    if (_self.metadata == null) {
    return null;
  }

  return $ComponentMetadataCopyWith<$Res>(_self.metadata!, (value) {
    return _then(_self.copyWith(metadata: value));
  });
}
}


/// @nodoc
mixin _$Narration {

/// Plain text narration
 String get text;/// SSML-formatted narration for enhanced TTS
 String? get ssml;
/// Create a copy of Narration
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$NarrationCopyWith<Narration> get copyWith => _$NarrationCopyWithImpl<Narration>(this as Narration, _$identity);

  /// Serializes this Narration to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Narration&&(identical(other.text, text) || other.text == text)&&(identical(other.ssml, ssml) || other.ssml == ssml));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,text,ssml);

@override
String toString() {
  return 'Narration(text: $text, ssml: $ssml)';
}


}

/// @nodoc
abstract mixin class $NarrationCopyWith<$Res>  {
  factory $NarrationCopyWith(Narration value, $Res Function(Narration) _then) = _$NarrationCopyWithImpl;
@useResult
$Res call({
 String text, String? ssml
});




}
/// @nodoc
class _$NarrationCopyWithImpl<$Res>
    implements $NarrationCopyWith<$Res> {
  _$NarrationCopyWithImpl(this._self, this._then);

  final Narration _self;
  final $Res Function(Narration) _then;

/// Create a copy of Narration
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? text = null,Object? ssml = freezed,}) {
  return _then(_self.copyWith(
text: null == text ? _self.text : text // ignore: cast_nullable_to_non_nullable
as String,ssml: freezed == ssml ? _self.ssml : ssml // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [Narration].
extension NarrationPatterns on Narration {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Narration value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Narration() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Narration value)  $default,){
final _that = this;
switch (_that) {
case _Narration():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Narration value)?  $default,){
final _that = this;
switch (_that) {
case _Narration() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String text,  String? ssml)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Narration() when $default != null:
return $default(_that.text,_that.ssml);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String text,  String? ssml)  $default,) {final _that = this;
switch (_that) {
case _Narration():
return $default(_that.text,_that.ssml);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String text,  String? ssml)?  $default,) {final _that = this;
switch (_that) {
case _Narration() when $default != null:
return $default(_that.text,_that.ssml);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Narration implements Narration {
  const _Narration({required this.text, this.ssml});
  factory _Narration.fromJson(Map<String, dynamic> json) => _$NarrationFromJson(json);

/// Plain text narration
@override final  String text;
/// SSML-formatted narration for enhanced TTS
@override final  String? ssml;

/// Create a copy of Narration
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$NarrationCopyWith<_Narration> get copyWith => __$NarrationCopyWithImpl<_Narration>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$NarrationToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Narration&&(identical(other.text, text) || other.text == text)&&(identical(other.ssml, ssml) || other.ssml == ssml));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,text,ssml);

@override
String toString() {
  return 'Narration(text: $text, ssml: $ssml)';
}


}

/// @nodoc
abstract mixin class _$NarrationCopyWith<$Res> implements $NarrationCopyWith<$Res> {
  factory _$NarrationCopyWith(_Narration value, $Res Function(_Narration) _then) = __$NarrationCopyWithImpl;
@override @useResult
$Res call({
 String text, String? ssml
});




}
/// @nodoc
class __$NarrationCopyWithImpl<$Res>
    implements _$NarrationCopyWith<$Res> {
  __$NarrationCopyWithImpl(this._self, this._then);

  final _Narration _self;
  final $Res Function(_Narration) _then;

/// Create a copy of Narration
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? text = null,Object? ssml = freezed,}) {
  return _then(_Narration(
text: null == text ? _self.text : text // ignore: cast_nullable_to_non_nullable
as String,ssml: freezed == ssml ? _self.ssml : ssml // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$ComponentAction {

/// Unique action identifier
 String get id;/// Action label for UI
 String get label;/// Optional icon name
 String? get icon;/// Button variant: 'primary', 'secondary', 'danger', etc.
 String get variant;/// Target for navigation actions (e.g., '/hr/employees/:id')
 String? get target;/// Display directive for expand/drilldown actions
 String? get directive;
/// Create a copy of ComponentAction
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ComponentActionCopyWith<ComponentAction> get copyWith => _$ComponentActionCopyWithImpl<ComponentAction>(this as ComponentAction, _$identity);

  /// Serializes this ComponentAction to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ComponentAction&&(identical(other.id, id) || other.id == id)&&(identical(other.label, label) || other.label == label)&&(identical(other.icon, icon) || other.icon == icon)&&(identical(other.variant, variant) || other.variant == variant)&&(identical(other.target, target) || other.target == target)&&(identical(other.directive, directive) || other.directive == directive));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,label,icon,variant,target,directive);

@override
String toString() {
  return 'ComponentAction(id: $id, label: $label, icon: $icon, variant: $variant, target: $target, directive: $directive)';
}


}

/// @nodoc
abstract mixin class $ComponentActionCopyWith<$Res>  {
  factory $ComponentActionCopyWith(ComponentAction value, $Res Function(ComponentAction) _then) = _$ComponentActionCopyWithImpl;
@useResult
$Res call({
 String id, String label, String? icon, String variant, String? target, String? directive
});




}
/// @nodoc
class _$ComponentActionCopyWithImpl<$Res>
    implements $ComponentActionCopyWith<$Res> {
  _$ComponentActionCopyWithImpl(this._self, this._then);

  final ComponentAction _self;
  final $Res Function(ComponentAction) _then;

/// Create a copy of ComponentAction
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? label = null,Object? icon = freezed,Object? variant = null,Object? target = freezed,Object? directive = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,icon: freezed == icon ? _self.icon : icon // ignore: cast_nullable_to_non_nullable
as String?,variant: null == variant ? _self.variant : variant // ignore: cast_nullable_to_non_nullable
as String,target: freezed == target ? _self.target : target // ignore: cast_nullable_to_non_nullable
as String?,directive: freezed == directive ? _self.directive : directive // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ComponentAction].
extension ComponentActionPatterns on ComponentAction {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ComponentAction value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ComponentAction() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ComponentAction value)  $default,){
final _that = this;
switch (_that) {
case _ComponentAction():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ComponentAction value)?  $default,){
final _that = this;
switch (_that) {
case _ComponentAction() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String label,  String? icon,  String variant,  String? target,  String? directive)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ComponentAction() when $default != null:
return $default(_that.id,_that.label,_that.icon,_that.variant,_that.target,_that.directive);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String label,  String? icon,  String variant,  String? target,  String? directive)  $default,) {final _that = this;
switch (_that) {
case _ComponentAction():
return $default(_that.id,_that.label,_that.icon,_that.variant,_that.target,_that.directive);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String label,  String? icon,  String variant,  String? target,  String? directive)?  $default,) {final _that = this;
switch (_that) {
case _ComponentAction() when $default != null:
return $default(_that.id,_that.label,_that.icon,_that.variant,_that.target,_that.directive);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ComponentAction implements ComponentAction {
  const _ComponentAction({required this.id, required this.label, this.icon, this.variant = 'primary', this.target, this.directive});
  factory _ComponentAction.fromJson(Map<String, dynamic> json) => _$ComponentActionFromJson(json);

/// Unique action identifier
@override final  String id;
/// Action label for UI
@override final  String label;
/// Optional icon name
@override final  String? icon;
/// Button variant: 'primary', 'secondary', 'danger', etc.
@override@JsonKey() final  String variant;
/// Target for navigation actions (e.g., '/hr/employees/:id')
@override final  String? target;
/// Display directive for expand/drilldown actions
@override final  String? directive;

/// Create a copy of ComponentAction
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ComponentActionCopyWith<_ComponentAction> get copyWith => __$ComponentActionCopyWithImpl<_ComponentAction>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ComponentActionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ComponentAction&&(identical(other.id, id) || other.id == id)&&(identical(other.label, label) || other.label == label)&&(identical(other.icon, icon) || other.icon == icon)&&(identical(other.variant, variant) || other.variant == variant)&&(identical(other.target, target) || other.target == target)&&(identical(other.directive, directive) || other.directive == directive));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,label,icon,variant,target,directive);

@override
String toString() {
  return 'ComponentAction(id: $id, label: $label, icon: $icon, variant: $variant, target: $target, directive: $directive)';
}


}

/// @nodoc
abstract mixin class _$ComponentActionCopyWith<$Res> implements $ComponentActionCopyWith<$Res> {
  factory _$ComponentActionCopyWith(_ComponentAction value, $Res Function(_ComponentAction) _then) = __$ComponentActionCopyWithImpl;
@override @useResult
$Res call({
 String id, String label, String? icon, String variant, String? target, String? directive
});




}
/// @nodoc
class __$ComponentActionCopyWithImpl<$Res>
    implements _$ComponentActionCopyWith<$Res> {
  __$ComponentActionCopyWithImpl(this._self, this._then);

  final _ComponentAction _self;
  final $Res Function(_ComponentAction) _then;

/// Create a copy of ComponentAction
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? label = null,Object? icon = freezed,Object? variant = null,Object? target = freezed,Object? directive = freezed,}) {
  return _then(_ComponentAction(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,icon: freezed == icon ? _self.icon : icon // ignore: cast_nullable_to_non_nullable
as String?,variant: null == variant ? _self.variant : variant // ignore: cast_nullable_to_non_nullable
as String,target: freezed == target ? _self.target : target // ignore: cast_nullable_to_non_nullable
as String?,directive: freezed == directive ? _self.directive : directive // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$ComponentMetadata {

/// When the data was fetched
 DateTime? get dataFreshness;/// Whether the data was truncated
 bool get truncated;/// Total count as string (e.g., "50+")
 String? get totalCount;/// Warning message if truncated or issues
 String? get warning;
/// Create a copy of ComponentMetadata
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ComponentMetadataCopyWith<ComponentMetadata> get copyWith => _$ComponentMetadataCopyWithImpl<ComponentMetadata>(this as ComponentMetadata, _$identity);

  /// Serializes this ComponentMetadata to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ComponentMetadata&&(identical(other.dataFreshness, dataFreshness) || other.dataFreshness == dataFreshness)&&(identical(other.truncated, truncated) || other.truncated == truncated)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.warning, warning) || other.warning == warning));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,dataFreshness,truncated,totalCount,warning);

@override
String toString() {
  return 'ComponentMetadata(dataFreshness: $dataFreshness, truncated: $truncated, totalCount: $totalCount, warning: $warning)';
}


}

/// @nodoc
abstract mixin class $ComponentMetadataCopyWith<$Res>  {
  factory $ComponentMetadataCopyWith(ComponentMetadata value, $Res Function(ComponentMetadata) _then) = _$ComponentMetadataCopyWithImpl;
@useResult
$Res call({
 DateTime? dataFreshness, bool truncated, String? totalCount, String? warning
});




}
/// @nodoc
class _$ComponentMetadataCopyWithImpl<$Res>
    implements $ComponentMetadataCopyWith<$Res> {
  _$ComponentMetadataCopyWithImpl(this._self, this._then);

  final ComponentMetadata _self;
  final $Res Function(ComponentMetadata) _then;

/// Create a copy of ComponentMetadata
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? dataFreshness = freezed,Object? truncated = null,Object? totalCount = freezed,Object? warning = freezed,}) {
  return _then(_self.copyWith(
dataFreshness: freezed == dataFreshness ? _self.dataFreshness : dataFreshness // ignore: cast_nullable_to_non_nullable
as DateTime?,truncated: null == truncated ? _self.truncated : truncated // ignore: cast_nullable_to_non_nullable
as bool,totalCount: freezed == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as String?,warning: freezed == warning ? _self.warning : warning // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ComponentMetadata].
extension ComponentMetadataPatterns on ComponentMetadata {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ComponentMetadata value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ComponentMetadata() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ComponentMetadata value)  $default,){
final _that = this;
switch (_that) {
case _ComponentMetadata():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ComponentMetadata value)?  $default,){
final _that = this;
switch (_that) {
case _ComponentMetadata() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( DateTime? dataFreshness,  bool truncated,  String? totalCount,  String? warning)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ComponentMetadata() when $default != null:
return $default(_that.dataFreshness,_that.truncated,_that.totalCount,_that.warning);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( DateTime? dataFreshness,  bool truncated,  String? totalCount,  String? warning)  $default,) {final _that = this;
switch (_that) {
case _ComponentMetadata():
return $default(_that.dataFreshness,_that.truncated,_that.totalCount,_that.warning);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( DateTime? dataFreshness,  bool truncated,  String? totalCount,  String? warning)?  $default,) {final _that = this;
switch (_that) {
case _ComponentMetadata() when $default != null:
return $default(_that.dataFreshness,_that.truncated,_that.totalCount,_that.warning);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ComponentMetadata implements ComponentMetadata {
  const _ComponentMetadata({this.dataFreshness, this.truncated = false, this.totalCount, this.warning});
  factory _ComponentMetadata.fromJson(Map<String, dynamic> json) => _$ComponentMetadataFromJson(json);

/// When the data was fetched
@override final  DateTime? dataFreshness;
/// Whether the data was truncated
@override@JsonKey() final  bool truncated;
/// Total count as string (e.g., "50+")
@override final  String? totalCount;
/// Warning message if truncated or issues
@override final  String? warning;

/// Create a copy of ComponentMetadata
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ComponentMetadataCopyWith<_ComponentMetadata> get copyWith => __$ComponentMetadataCopyWithImpl<_ComponentMetadata>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ComponentMetadataToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ComponentMetadata&&(identical(other.dataFreshness, dataFreshness) || other.dataFreshness == dataFreshness)&&(identical(other.truncated, truncated) || other.truncated == truncated)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.warning, warning) || other.warning == warning));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,dataFreshness,truncated,totalCount,warning);

@override
String toString() {
  return 'ComponentMetadata(dataFreshness: $dataFreshness, truncated: $truncated, totalCount: $totalCount, warning: $warning)';
}


}

/// @nodoc
abstract mixin class _$ComponentMetadataCopyWith<$Res> implements $ComponentMetadataCopyWith<$Res> {
  factory _$ComponentMetadataCopyWith(_ComponentMetadata value, $Res Function(_ComponentMetadata) _then) = __$ComponentMetadataCopyWithImpl;
@override @useResult
$Res call({
 DateTime? dataFreshness, bool truncated, String? totalCount, String? warning
});




}
/// @nodoc
class __$ComponentMetadataCopyWithImpl<$Res>
    implements _$ComponentMetadataCopyWith<$Res> {
  __$ComponentMetadataCopyWithImpl(this._self, this._then);

  final _ComponentMetadata _self;
  final $Res Function(_ComponentMetadata) _then;

/// Create a copy of ComponentMetadata
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? dataFreshness = freezed,Object? truncated = null,Object? totalCount = freezed,Object? warning = freezed,}) {
  return _then(_ComponentMetadata(
dataFreshness: freezed == dataFreshness ? _self.dataFreshness : dataFreshness // ignore: cast_nullable_to_non_nullable
as DateTime?,truncated: null == truncated ? _self.truncated : truncated // ignore: cast_nullable_to_non_nullable
as bool,totalCount: freezed == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as String?,warning: freezed == warning ? _self.warning : warning // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$Employee {

 String get id; String get name; String get title; String? get email; String? get avatarUrl; String? get department;
/// Create a copy of Employee
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$EmployeeCopyWith<Employee> get copyWith => _$EmployeeCopyWithImpl<Employee>(this as Employee, _$identity);

  /// Serializes this Employee to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Employee&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.title, title) || other.title == title)&&(identical(other.email, email) || other.email == email)&&(identical(other.avatarUrl, avatarUrl) || other.avatarUrl == avatarUrl)&&(identical(other.department, department) || other.department == department));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,title,email,avatarUrl,department);

@override
String toString() {
  return 'Employee(id: $id, name: $name, title: $title, email: $email, avatarUrl: $avatarUrl, department: $department)';
}


}

/// @nodoc
abstract mixin class $EmployeeCopyWith<$Res>  {
  factory $EmployeeCopyWith(Employee value, $Res Function(Employee) _then) = _$EmployeeCopyWithImpl;
@useResult
$Res call({
 String id, String name, String title, String? email, String? avatarUrl, String? department
});




}
/// @nodoc
class _$EmployeeCopyWithImpl<$Res>
    implements $EmployeeCopyWith<$Res> {
  _$EmployeeCopyWithImpl(this._self, this._then);

  final Employee _self;
  final $Res Function(Employee) _then;

/// Create a copy of Employee
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? title = null,Object? email = freezed,Object? avatarUrl = freezed,Object? department = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,avatarUrl: freezed == avatarUrl ? _self.avatarUrl : avatarUrl // ignore: cast_nullable_to_non_nullable
as String?,department: freezed == department ? _self.department : department // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [Employee].
extension EmployeePatterns on Employee {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Employee value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Employee() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Employee value)  $default,){
final _that = this;
switch (_that) {
case _Employee():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Employee value)?  $default,){
final _that = this;
switch (_that) {
case _Employee() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String title,  String? email,  String? avatarUrl,  String? department)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Employee() when $default != null:
return $default(_that.id,_that.name,_that.title,_that.email,_that.avatarUrl,_that.department);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String title,  String? email,  String? avatarUrl,  String? department)  $default,) {final _that = this;
switch (_that) {
case _Employee():
return $default(_that.id,_that.name,_that.title,_that.email,_that.avatarUrl,_that.department);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String title,  String? email,  String? avatarUrl,  String? department)?  $default,) {final _that = this;
switch (_that) {
case _Employee() when $default != null:
return $default(_that.id,_that.name,_that.title,_that.email,_that.avatarUrl,_that.department);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Employee implements Employee {
  const _Employee({required this.id, required this.name, required this.title, this.email, this.avatarUrl, this.department});
  factory _Employee.fromJson(Map<String, dynamic> json) => _$EmployeeFromJson(json);

@override final  String id;
@override final  String name;
@override final  String title;
@override final  String? email;
@override final  String? avatarUrl;
@override final  String? department;

/// Create a copy of Employee
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$EmployeeCopyWith<_Employee> get copyWith => __$EmployeeCopyWithImpl<_Employee>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$EmployeeToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Employee&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.title, title) || other.title == title)&&(identical(other.email, email) || other.email == email)&&(identical(other.avatarUrl, avatarUrl) || other.avatarUrl == avatarUrl)&&(identical(other.department, department) || other.department == department));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,title,email,avatarUrl,department);

@override
String toString() {
  return 'Employee(id: $id, name: $name, title: $title, email: $email, avatarUrl: $avatarUrl, department: $department)';
}


}

/// @nodoc
abstract mixin class _$EmployeeCopyWith<$Res> implements $EmployeeCopyWith<$Res> {
  factory _$EmployeeCopyWith(_Employee value, $Res Function(_Employee) _then) = __$EmployeeCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String title, String? email, String? avatarUrl, String? department
});




}
/// @nodoc
class __$EmployeeCopyWithImpl<$Res>
    implements _$EmployeeCopyWith<$Res> {
  __$EmployeeCopyWithImpl(this._self, this._then);

  final _Employee _self;
  final $Res Function(_Employee) _then;

/// Create a copy of Employee
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? title = null,Object? email = freezed,Object? avatarUrl = freezed,Object? department = freezed,}) {
  return _then(_Employee(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,avatarUrl: freezed == avatarUrl ? _self.avatarUrl : avatarUrl // ignore: cast_nullable_to_non_nullable
as String?,department: freezed == department ? _self.department : department // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$TimeOffRequest {

 String get id; String get employeeName; DateTime get startDate; DateTime get endDate; String get type; String? get reason; String? get employeeId; String get status; DateTime? get submittedAt;
/// Create a copy of TimeOffRequest
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$TimeOffRequestCopyWith<TimeOffRequest> get copyWith => _$TimeOffRequestCopyWithImpl<TimeOffRequest>(this as TimeOffRequest, _$identity);

  /// Serializes this TimeOffRequest to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is TimeOffRequest&&(identical(other.id, id) || other.id == id)&&(identical(other.employeeName, employeeName) || other.employeeName == employeeName)&&(identical(other.startDate, startDate) || other.startDate == startDate)&&(identical(other.endDate, endDate) || other.endDate == endDate)&&(identical(other.type, type) || other.type == type)&&(identical(other.reason, reason) || other.reason == reason)&&(identical(other.employeeId, employeeId) || other.employeeId == employeeId)&&(identical(other.status, status) || other.status == status)&&(identical(other.submittedAt, submittedAt) || other.submittedAt == submittedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,employeeName,startDate,endDate,type,reason,employeeId,status,submittedAt);

@override
String toString() {
  return 'TimeOffRequest(id: $id, employeeName: $employeeName, startDate: $startDate, endDate: $endDate, type: $type, reason: $reason, employeeId: $employeeId, status: $status, submittedAt: $submittedAt)';
}


}

/// @nodoc
abstract mixin class $TimeOffRequestCopyWith<$Res>  {
  factory $TimeOffRequestCopyWith(TimeOffRequest value, $Res Function(TimeOffRequest) _then) = _$TimeOffRequestCopyWithImpl;
@useResult
$Res call({
 String id, String employeeName, DateTime startDate, DateTime endDate, String type, String? reason, String? employeeId, String status, DateTime? submittedAt
});




}
/// @nodoc
class _$TimeOffRequestCopyWithImpl<$Res>
    implements $TimeOffRequestCopyWith<$Res> {
  _$TimeOffRequestCopyWithImpl(this._self, this._then);

  final TimeOffRequest _self;
  final $Res Function(TimeOffRequest) _then;

/// Create a copy of TimeOffRequest
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? employeeName = null,Object? startDate = null,Object? endDate = null,Object? type = null,Object? reason = freezed,Object? employeeId = freezed,Object? status = null,Object? submittedAt = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,employeeName: null == employeeName ? _self.employeeName : employeeName // ignore: cast_nullable_to_non_nullable
as String,startDate: null == startDate ? _self.startDate : startDate // ignore: cast_nullable_to_non_nullable
as DateTime,endDate: null == endDate ? _self.endDate : endDate // ignore: cast_nullable_to_non_nullable
as DateTime,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,reason: freezed == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String?,employeeId: freezed == employeeId ? _self.employeeId : employeeId // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,submittedAt: freezed == submittedAt ? _self.submittedAt : submittedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [TimeOffRequest].
extension TimeOffRequestPatterns on TimeOffRequest {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _TimeOffRequest value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _TimeOffRequest() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _TimeOffRequest value)  $default,){
final _that = this;
switch (_that) {
case _TimeOffRequest():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _TimeOffRequest value)?  $default,){
final _that = this;
switch (_that) {
case _TimeOffRequest() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String employeeName,  DateTime startDate,  DateTime endDate,  String type,  String? reason,  String? employeeId,  String status,  DateTime? submittedAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _TimeOffRequest() when $default != null:
return $default(_that.id,_that.employeeName,_that.startDate,_that.endDate,_that.type,_that.reason,_that.employeeId,_that.status,_that.submittedAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String employeeName,  DateTime startDate,  DateTime endDate,  String type,  String? reason,  String? employeeId,  String status,  DateTime? submittedAt)  $default,) {final _that = this;
switch (_that) {
case _TimeOffRequest():
return $default(_that.id,_that.employeeName,_that.startDate,_that.endDate,_that.type,_that.reason,_that.employeeId,_that.status,_that.submittedAt);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String employeeName,  DateTime startDate,  DateTime endDate,  String type,  String? reason,  String? employeeId,  String status,  DateTime? submittedAt)?  $default,) {final _that = this;
switch (_that) {
case _TimeOffRequest() when $default != null:
return $default(_that.id,_that.employeeName,_that.startDate,_that.endDate,_that.type,_that.reason,_that.employeeId,_that.status,_that.submittedAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _TimeOffRequest implements TimeOffRequest {
  const _TimeOffRequest({required this.id, required this.employeeName, required this.startDate, required this.endDate, required this.type, this.reason, this.employeeId, this.status = 'pending', this.submittedAt});
  factory _TimeOffRequest.fromJson(Map<String, dynamic> json) => _$TimeOffRequestFromJson(json);

@override final  String id;
@override final  String employeeName;
@override final  DateTime startDate;
@override final  DateTime endDate;
@override final  String type;
@override final  String? reason;
@override final  String? employeeId;
@override@JsonKey() final  String status;
@override final  DateTime? submittedAt;

/// Create a copy of TimeOffRequest
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$TimeOffRequestCopyWith<_TimeOffRequest> get copyWith => __$TimeOffRequestCopyWithImpl<_TimeOffRequest>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$TimeOffRequestToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _TimeOffRequest&&(identical(other.id, id) || other.id == id)&&(identical(other.employeeName, employeeName) || other.employeeName == employeeName)&&(identical(other.startDate, startDate) || other.startDate == startDate)&&(identical(other.endDate, endDate) || other.endDate == endDate)&&(identical(other.type, type) || other.type == type)&&(identical(other.reason, reason) || other.reason == reason)&&(identical(other.employeeId, employeeId) || other.employeeId == employeeId)&&(identical(other.status, status) || other.status == status)&&(identical(other.submittedAt, submittedAt) || other.submittedAt == submittedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,employeeName,startDate,endDate,type,reason,employeeId,status,submittedAt);

@override
String toString() {
  return 'TimeOffRequest(id: $id, employeeName: $employeeName, startDate: $startDate, endDate: $endDate, type: $type, reason: $reason, employeeId: $employeeId, status: $status, submittedAt: $submittedAt)';
}


}

/// @nodoc
abstract mixin class _$TimeOffRequestCopyWith<$Res> implements $TimeOffRequestCopyWith<$Res> {
  factory _$TimeOffRequestCopyWith(_TimeOffRequest value, $Res Function(_TimeOffRequest) _then) = __$TimeOffRequestCopyWithImpl;
@override @useResult
$Res call({
 String id, String employeeName, DateTime startDate, DateTime endDate, String type, String? reason, String? employeeId, String status, DateTime? submittedAt
});




}
/// @nodoc
class __$TimeOffRequestCopyWithImpl<$Res>
    implements _$TimeOffRequestCopyWith<$Res> {
  __$TimeOffRequestCopyWithImpl(this._self, this._then);

  final _TimeOffRequest _self;
  final $Res Function(_TimeOffRequest) _then;

/// Create a copy of TimeOffRequest
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? employeeName = null,Object? startDate = null,Object? endDate = null,Object? type = null,Object? reason = freezed,Object? employeeId = freezed,Object? status = null,Object? submittedAt = freezed,}) {
  return _then(_TimeOffRequest(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,employeeName: null == employeeName ? _self.employeeName : employeeName // ignore: cast_nullable_to_non_nullable
as String,startDate: null == startDate ? _self.startDate : startDate // ignore: cast_nullable_to_non_nullable
as DateTime,endDate: null == endDate ? _self.endDate : endDate // ignore: cast_nullable_to_non_nullable
as DateTime,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,reason: freezed == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String?,employeeId: freezed == employeeId ? _self.employeeId : employeeId // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,submittedAt: freezed == submittedAt ? _self.submittedAt : submittedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}


/// @nodoc
mixin _$OrgChartData {

 Employee? get manager; Employee get self; List<Employee> get peers; List<Employee> get directReports;
/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OrgChartDataCopyWith<OrgChartData> get copyWith => _$OrgChartDataCopyWithImpl<OrgChartData>(this as OrgChartData, _$identity);

  /// Serializes this OrgChartData to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is OrgChartData&&(identical(other.manager, manager) || other.manager == manager)&&(identical(other.self, self) || other.self == self)&&const DeepCollectionEquality().equals(other.peers, peers)&&const DeepCollectionEquality().equals(other.directReports, directReports));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,manager,self,const DeepCollectionEquality().hash(peers),const DeepCollectionEquality().hash(directReports));

@override
String toString() {
  return 'OrgChartData(manager: $manager, self: $self, peers: $peers, directReports: $directReports)';
}


}

/// @nodoc
abstract mixin class $OrgChartDataCopyWith<$Res>  {
  factory $OrgChartDataCopyWith(OrgChartData value, $Res Function(OrgChartData) _then) = _$OrgChartDataCopyWithImpl;
@useResult
$Res call({
 Employee? manager, Employee self, List<Employee> peers, List<Employee> directReports
});


$EmployeeCopyWith<$Res>? get manager;$EmployeeCopyWith<$Res> get self;

}
/// @nodoc
class _$OrgChartDataCopyWithImpl<$Res>
    implements $OrgChartDataCopyWith<$Res> {
  _$OrgChartDataCopyWithImpl(this._self, this._then);

  final OrgChartData _self;
  final $Res Function(OrgChartData) _then;

/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? manager = freezed,Object? self = null,Object? peers = null,Object? directReports = null,}) {
  return _then(_self.copyWith(
manager: freezed == manager ? _self.manager : manager // ignore: cast_nullable_to_non_nullable
as Employee?,self: null == self ? _self.self : self // ignore: cast_nullable_to_non_nullable
as Employee,peers: null == peers ? _self.peers : peers // ignore: cast_nullable_to_non_nullable
as List<Employee>,directReports: null == directReports ? _self.directReports : directReports // ignore: cast_nullable_to_non_nullable
as List<Employee>,
  ));
}
/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EmployeeCopyWith<$Res>? get manager {
    if (_self.manager == null) {
    return null;
  }

  return $EmployeeCopyWith<$Res>(_self.manager!, (value) {
    return _then(_self.copyWith(manager: value));
  });
}/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EmployeeCopyWith<$Res> get self {
  
  return $EmployeeCopyWith<$Res>(_self.self, (value) {
    return _then(_self.copyWith(self: value));
  });
}
}


/// Adds pattern-matching-related methods to [OrgChartData].
extension OrgChartDataPatterns on OrgChartData {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _OrgChartData value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _OrgChartData() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _OrgChartData value)  $default,){
final _that = this;
switch (_that) {
case _OrgChartData():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _OrgChartData value)?  $default,){
final _that = this;
switch (_that) {
case _OrgChartData() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( Employee? manager,  Employee self,  List<Employee> peers,  List<Employee> directReports)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _OrgChartData() when $default != null:
return $default(_that.manager,_that.self,_that.peers,_that.directReports);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( Employee? manager,  Employee self,  List<Employee> peers,  List<Employee> directReports)  $default,) {final _that = this;
switch (_that) {
case _OrgChartData():
return $default(_that.manager,_that.self,_that.peers,_that.directReports);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( Employee? manager,  Employee self,  List<Employee> peers,  List<Employee> directReports)?  $default,) {final _that = this;
switch (_that) {
case _OrgChartData() when $default != null:
return $default(_that.manager,_that.self,_that.peers,_that.directReports);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _OrgChartData implements OrgChartData {
  const _OrgChartData({this.manager, required this.self, final  List<Employee> peers = const [], final  List<Employee> directReports = const []}): _peers = peers,_directReports = directReports;
  factory _OrgChartData.fromJson(Map<String, dynamic> json) => _$OrgChartDataFromJson(json);

@override final  Employee? manager;
@override final  Employee self;
 final  List<Employee> _peers;
@override@JsonKey() List<Employee> get peers {
  if (_peers is EqualUnmodifiableListView) return _peers;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_peers);
}

 final  List<Employee> _directReports;
@override@JsonKey() List<Employee> get directReports {
  if (_directReports is EqualUnmodifiableListView) return _directReports;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_directReports);
}


/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OrgChartDataCopyWith<_OrgChartData> get copyWith => __$OrgChartDataCopyWithImpl<_OrgChartData>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OrgChartDataToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _OrgChartData&&(identical(other.manager, manager) || other.manager == manager)&&(identical(other.self, self) || other.self == self)&&const DeepCollectionEquality().equals(other._peers, _peers)&&const DeepCollectionEquality().equals(other._directReports, _directReports));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,manager,self,const DeepCollectionEquality().hash(_peers),const DeepCollectionEquality().hash(_directReports));

@override
String toString() {
  return 'OrgChartData(manager: $manager, self: $self, peers: $peers, directReports: $directReports)';
}


}

/// @nodoc
abstract mixin class _$OrgChartDataCopyWith<$Res> implements $OrgChartDataCopyWith<$Res> {
  factory _$OrgChartDataCopyWith(_OrgChartData value, $Res Function(_OrgChartData) _then) = __$OrgChartDataCopyWithImpl;
@override @useResult
$Res call({
 Employee? manager, Employee self, List<Employee> peers, List<Employee> directReports
});


@override $EmployeeCopyWith<$Res>? get manager;@override $EmployeeCopyWith<$Res> get self;

}
/// @nodoc
class __$OrgChartDataCopyWithImpl<$Res>
    implements _$OrgChartDataCopyWith<$Res> {
  __$OrgChartDataCopyWithImpl(this._self, this._then);

  final _OrgChartData _self;
  final $Res Function(_OrgChartData) _then;

/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? manager = freezed,Object? self = null,Object? peers = null,Object? directReports = null,}) {
  return _then(_OrgChartData(
manager: freezed == manager ? _self.manager : manager // ignore: cast_nullable_to_non_nullable
as Employee?,self: null == self ? _self.self : self // ignore: cast_nullable_to_non_nullable
as Employee,peers: null == peers ? _self._peers : peers // ignore: cast_nullable_to_non_nullable
as List<Employee>,directReports: null == directReports ? _self._directReports : directReports // ignore: cast_nullable_to_non_nullable
as List<Employee>,
  ));
}

/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EmployeeCopyWith<$Res>? get manager {
    if (_self.manager == null) {
    return null;
  }

  return $EmployeeCopyWith<$Res>(_self.manager!, (value) {
    return _then(_self.copyWith(manager: value));
  });
}/// Create a copy of OrgChartData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EmployeeCopyWith<$Res> get self {
  
  return $EmployeeCopyWith<$Res>(_self.self, (value) {
    return _then(_self.copyWith(self: value));
  });
}
}


/// @nodoc
mixin _$ExpenseReport {

 String get id; String get employeeName; double get amount; DateTime get date; String get description; int get itemCount; String? get employeeId; String get status; DateTime? get submittedAt;
/// Create a copy of ExpenseReport
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ExpenseReportCopyWith<ExpenseReport> get copyWith => _$ExpenseReportCopyWithImpl<ExpenseReport>(this as ExpenseReport, _$identity);

  /// Serializes this ExpenseReport to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ExpenseReport&&(identical(other.id, id) || other.id == id)&&(identical(other.employeeName, employeeName) || other.employeeName == employeeName)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.date, date) || other.date == date)&&(identical(other.description, description) || other.description == description)&&(identical(other.itemCount, itemCount) || other.itemCount == itemCount)&&(identical(other.employeeId, employeeId) || other.employeeId == employeeId)&&(identical(other.status, status) || other.status == status)&&(identical(other.submittedAt, submittedAt) || other.submittedAt == submittedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,employeeName,amount,date,description,itemCount,employeeId,status,submittedAt);

@override
String toString() {
  return 'ExpenseReport(id: $id, employeeName: $employeeName, amount: $amount, date: $date, description: $description, itemCount: $itemCount, employeeId: $employeeId, status: $status, submittedAt: $submittedAt)';
}


}

/// @nodoc
abstract mixin class $ExpenseReportCopyWith<$Res>  {
  factory $ExpenseReportCopyWith(ExpenseReport value, $Res Function(ExpenseReport) _then) = _$ExpenseReportCopyWithImpl;
@useResult
$Res call({
 String id, String employeeName, double amount, DateTime date, String description, int itemCount, String? employeeId, String status, DateTime? submittedAt
});




}
/// @nodoc
class _$ExpenseReportCopyWithImpl<$Res>
    implements $ExpenseReportCopyWith<$Res> {
  _$ExpenseReportCopyWithImpl(this._self, this._then);

  final ExpenseReport _self;
  final $Res Function(ExpenseReport) _then;

/// Create a copy of ExpenseReport
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? employeeName = null,Object? amount = null,Object? date = null,Object? description = null,Object? itemCount = null,Object? employeeId = freezed,Object? status = null,Object? submittedAt = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,employeeName: null == employeeName ? _self.employeeName : employeeName // ignore: cast_nullable_to_non_nullable
as String,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as DateTime,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,itemCount: null == itemCount ? _self.itemCount : itemCount // ignore: cast_nullable_to_non_nullable
as int,employeeId: freezed == employeeId ? _self.employeeId : employeeId // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,submittedAt: freezed == submittedAt ? _self.submittedAt : submittedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [ExpenseReport].
extension ExpenseReportPatterns on ExpenseReport {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ExpenseReport value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ExpenseReport() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ExpenseReport value)  $default,){
final _that = this;
switch (_that) {
case _ExpenseReport():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ExpenseReport value)?  $default,){
final _that = this;
switch (_that) {
case _ExpenseReport() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String employeeName,  double amount,  DateTime date,  String description,  int itemCount,  String? employeeId,  String status,  DateTime? submittedAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ExpenseReport() when $default != null:
return $default(_that.id,_that.employeeName,_that.amount,_that.date,_that.description,_that.itemCount,_that.employeeId,_that.status,_that.submittedAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String employeeName,  double amount,  DateTime date,  String description,  int itemCount,  String? employeeId,  String status,  DateTime? submittedAt)  $default,) {final _that = this;
switch (_that) {
case _ExpenseReport():
return $default(_that.id,_that.employeeName,_that.amount,_that.date,_that.description,_that.itemCount,_that.employeeId,_that.status,_that.submittedAt);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String employeeName,  double amount,  DateTime date,  String description,  int itemCount,  String? employeeId,  String status,  DateTime? submittedAt)?  $default,) {final _that = this;
switch (_that) {
case _ExpenseReport() when $default != null:
return $default(_that.id,_that.employeeName,_that.amount,_that.date,_that.description,_that.itemCount,_that.employeeId,_that.status,_that.submittedAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ExpenseReport implements ExpenseReport {
  const _ExpenseReport({required this.id, required this.employeeName, required this.amount, required this.date, required this.description, required this.itemCount, this.employeeId, this.status = 'SUBMITTED', this.submittedAt});
  factory _ExpenseReport.fromJson(Map<String, dynamic> json) => _$ExpenseReportFromJson(json);

@override final  String id;
@override final  String employeeName;
@override final  double amount;
@override final  DateTime date;
@override final  String description;
@override final  int itemCount;
@override final  String? employeeId;
@override@JsonKey() final  String status;
@override final  DateTime? submittedAt;

/// Create a copy of ExpenseReport
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ExpenseReportCopyWith<_ExpenseReport> get copyWith => __$ExpenseReportCopyWithImpl<_ExpenseReport>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ExpenseReportToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ExpenseReport&&(identical(other.id, id) || other.id == id)&&(identical(other.employeeName, employeeName) || other.employeeName == employeeName)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.date, date) || other.date == date)&&(identical(other.description, description) || other.description == description)&&(identical(other.itemCount, itemCount) || other.itemCount == itemCount)&&(identical(other.employeeId, employeeId) || other.employeeId == employeeId)&&(identical(other.status, status) || other.status == status)&&(identical(other.submittedAt, submittedAt) || other.submittedAt == submittedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,employeeName,amount,date,description,itemCount,employeeId,status,submittedAt);

@override
String toString() {
  return 'ExpenseReport(id: $id, employeeName: $employeeName, amount: $amount, date: $date, description: $description, itemCount: $itemCount, employeeId: $employeeId, status: $status, submittedAt: $submittedAt)';
}


}

/// @nodoc
abstract mixin class _$ExpenseReportCopyWith<$Res> implements $ExpenseReportCopyWith<$Res> {
  factory _$ExpenseReportCopyWith(_ExpenseReport value, $Res Function(_ExpenseReport) _then) = __$ExpenseReportCopyWithImpl;
@override @useResult
$Res call({
 String id, String employeeName, double amount, DateTime date, String description, int itemCount, String? employeeId, String status, DateTime? submittedAt
});




}
/// @nodoc
class __$ExpenseReportCopyWithImpl<$Res>
    implements _$ExpenseReportCopyWith<$Res> {
  __$ExpenseReportCopyWithImpl(this._self, this._then);

  final _ExpenseReport _self;
  final $Res Function(_ExpenseReport) _then;

/// Create a copy of ExpenseReport
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? employeeName = null,Object? amount = null,Object? date = null,Object? description = null,Object? itemCount = null,Object? employeeId = freezed,Object? status = null,Object? submittedAt = freezed,}) {
  return _then(_ExpenseReport(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,employeeName: null == employeeName ? _self.employeeName : employeeName // ignore: cast_nullable_to_non_nullable
as String,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as DateTime,description: null == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String,itemCount: null == itemCount ? _self.itemCount : itemCount // ignore: cast_nullable_to_non_nullable
as int,employeeId: freezed == employeeId ? _self.employeeId : employeeId // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,submittedAt: freezed == submittedAt ? _self.submittedAt : submittedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}


/// @nodoc
mixin _$BudgetAmendment {

 String get id; String get department; double get currentBudget; double get requestedBudget; String get reason; String? get submittedBy; String get status; DateTime? get submittedAt;
/// Create a copy of BudgetAmendment
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BudgetAmendmentCopyWith<BudgetAmendment> get copyWith => _$BudgetAmendmentCopyWithImpl<BudgetAmendment>(this as BudgetAmendment, _$identity);

  /// Serializes this BudgetAmendment to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BudgetAmendment&&(identical(other.id, id) || other.id == id)&&(identical(other.department, department) || other.department == department)&&(identical(other.currentBudget, currentBudget) || other.currentBudget == currentBudget)&&(identical(other.requestedBudget, requestedBudget) || other.requestedBudget == requestedBudget)&&(identical(other.reason, reason) || other.reason == reason)&&(identical(other.submittedBy, submittedBy) || other.submittedBy == submittedBy)&&(identical(other.status, status) || other.status == status)&&(identical(other.submittedAt, submittedAt) || other.submittedAt == submittedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,department,currentBudget,requestedBudget,reason,submittedBy,status,submittedAt);

@override
String toString() {
  return 'BudgetAmendment(id: $id, department: $department, currentBudget: $currentBudget, requestedBudget: $requestedBudget, reason: $reason, submittedBy: $submittedBy, status: $status, submittedAt: $submittedAt)';
}


}

/// @nodoc
abstract mixin class $BudgetAmendmentCopyWith<$Res>  {
  factory $BudgetAmendmentCopyWith(BudgetAmendment value, $Res Function(BudgetAmendment) _then) = _$BudgetAmendmentCopyWithImpl;
@useResult
$Res call({
 String id, String department, double currentBudget, double requestedBudget, String reason, String? submittedBy, String status, DateTime? submittedAt
});




}
/// @nodoc
class _$BudgetAmendmentCopyWithImpl<$Res>
    implements $BudgetAmendmentCopyWith<$Res> {
  _$BudgetAmendmentCopyWithImpl(this._self, this._then);

  final BudgetAmendment _self;
  final $Res Function(BudgetAmendment) _then;

/// Create a copy of BudgetAmendment
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? department = null,Object? currentBudget = null,Object? requestedBudget = null,Object? reason = null,Object? submittedBy = freezed,Object? status = null,Object? submittedAt = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,department: null == department ? _self.department : department // ignore: cast_nullable_to_non_nullable
as String,currentBudget: null == currentBudget ? _self.currentBudget : currentBudget // ignore: cast_nullable_to_non_nullable
as double,requestedBudget: null == requestedBudget ? _self.requestedBudget : requestedBudget // ignore: cast_nullable_to_non_nullable
as double,reason: null == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String,submittedBy: freezed == submittedBy ? _self.submittedBy : submittedBy // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,submittedAt: freezed == submittedAt ? _self.submittedAt : submittedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [BudgetAmendment].
extension BudgetAmendmentPatterns on BudgetAmendment {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BudgetAmendment value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BudgetAmendment() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BudgetAmendment value)  $default,){
final _that = this;
switch (_that) {
case _BudgetAmendment():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BudgetAmendment value)?  $default,){
final _that = this;
switch (_that) {
case _BudgetAmendment() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String department,  double currentBudget,  double requestedBudget,  String reason,  String? submittedBy,  String status,  DateTime? submittedAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BudgetAmendment() when $default != null:
return $default(_that.id,_that.department,_that.currentBudget,_that.requestedBudget,_that.reason,_that.submittedBy,_that.status,_that.submittedAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String department,  double currentBudget,  double requestedBudget,  String reason,  String? submittedBy,  String status,  DateTime? submittedAt)  $default,) {final _that = this;
switch (_that) {
case _BudgetAmendment():
return $default(_that.id,_that.department,_that.currentBudget,_that.requestedBudget,_that.reason,_that.submittedBy,_that.status,_that.submittedAt);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String department,  double currentBudget,  double requestedBudget,  String reason,  String? submittedBy,  String status,  DateTime? submittedAt)?  $default,) {final _that = this;
switch (_that) {
case _BudgetAmendment() when $default != null:
return $default(_that.id,_that.department,_that.currentBudget,_that.requestedBudget,_that.reason,_that.submittedBy,_that.status,_that.submittedAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BudgetAmendment implements BudgetAmendment {
  const _BudgetAmendment({required this.id, required this.department, required this.currentBudget, required this.requestedBudget, required this.reason, this.submittedBy, this.status = 'pending', this.submittedAt});
  factory _BudgetAmendment.fromJson(Map<String, dynamic> json) => _$BudgetAmendmentFromJson(json);

@override final  String id;
@override final  String department;
@override final  double currentBudget;
@override final  double requestedBudget;
@override final  String reason;
@override final  String? submittedBy;
@override@JsonKey() final  String status;
@override final  DateTime? submittedAt;

/// Create a copy of BudgetAmendment
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BudgetAmendmentCopyWith<_BudgetAmendment> get copyWith => __$BudgetAmendmentCopyWithImpl<_BudgetAmendment>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BudgetAmendmentToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BudgetAmendment&&(identical(other.id, id) || other.id == id)&&(identical(other.department, department) || other.department == department)&&(identical(other.currentBudget, currentBudget) || other.currentBudget == currentBudget)&&(identical(other.requestedBudget, requestedBudget) || other.requestedBudget == requestedBudget)&&(identical(other.reason, reason) || other.reason == reason)&&(identical(other.submittedBy, submittedBy) || other.submittedBy == submittedBy)&&(identical(other.status, status) || other.status == status)&&(identical(other.submittedAt, submittedAt) || other.submittedAt == submittedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,department,currentBudget,requestedBudget,reason,submittedBy,status,submittedAt);

@override
String toString() {
  return 'BudgetAmendment(id: $id, department: $department, currentBudget: $currentBudget, requestedBudget: $requestedBudget, reason: $reason, submittedBy: $submittedBy, status: $status, submittedAt: $submittedAt)';
}


}

/// @nodoc
abstract mixin class _$BudgetAmendmentCopyWith<$Res> implements $BudgetAmendmentCopyWith<$Res> {
  factory _$BudgetAmendmentCopyWith(_BudgetAmendment value, $Res Function(_BudgetAmendment) _then) = __$BudgetAmendmentCopyWithImpl;
@override @useResult
$Res call({
 String id, String department, double currentBudget, double requestedBudget, String reason, String? submittedBy, String status, DateTime? submittedAt
});




}
/// @nodoc
class __$BudgetAmendmentCopyWithImpl<$Res>
    implements _$BudgetAmendmentCopyWith<$Res> {
  __$BudgetAmendmentCopyWithImpl(this._self, this._then);

  final _BudgetAmendment _self;
  final $Res Function(_BudgetAmendment) _then;

/// Create a copy of BudgetAmendment
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? department = null,Object? currentBudget = null,Object? requestedBudget = null,Object? reason = null,Object? submittedBy = freezed,Object? status = null,Object? submittedAt = freezed,}) {
  return _then(_BudgetAmendment(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,department: null == department ? _self.department : department // ignore: cast_nullable_to_non_nullable
as String,currentBudget: null == currentBudget ? _self.currentBudget : currentBudget // ignore: cast_nullable_to_non_nullable
as double,requestedBudget: null == requestedBudget ? _self.requestedBudget : requestedBudget // ignore: cast_nullable_to_non_nullable
as double,reason: null == reason ? _self.reason : reason // ignore: cast_nullable_to_non_nullable
as String,submittedBy: freezed == submittedBy ? _self.submittedBy : submittedBy // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,submittedAt: freezed == submittedAt ? _self.submittedAt : submittedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}


/// @nodoc
mixin _$BudgetData {

 String get department; int get year; double get totalBudget; double get spent; double get remaining; double get percentUsed; List<CategorySpend> get categories; List<String> get warnings; String get status;
/// Create a copy of BudgetData
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BudgetDataCopyWith<BudgetData> get copyWith => _$BudgetDataCopyWithImpl<BudgetData>(this as BudgetData, _$identity);

  /// Serializes this BudgetData to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BudgetData&&(identical(other.department, department) || other.department == department)&&(identical(other.year, year) || other.year == year)&&(identical(other.totalBudget, totalBudget) || other.totalBudget == totalBudget)&&(identical(other.spent, spent) || other.spent == spent)&&(identical(other.remaining, remaining) || other.remaining == remaining)&&(identical(other.percentUsed, percentUsed) || other.percentUsed == percentUsed)&&const DeepCollectionEquality().equals(other.categories, categories)&&const DeepCollectionEquality().equals(other.warnings, warnings)&&(identical(other.status, status) || other.status == status));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,department,year,totalBudget,spent,remaining,percentUsed,const DeepCollectionEquality().hash(categories),const DeepCollectionEquality().hash(warnings),status);

@override
String toString() {
  return 'BudgetData(department: $department, year: $year, totalBudget: $totalBudget, spent: $spent, remaining: $remaining, percentUsed: $percentUsed, categories: $categories, warnings: $warnings, status: $status)';
}


}

/// @nodoc
abstract mixin class $BudgetDataCopyWith<$Res>  {
  factory $BudgetDataCopyWith(BudgetData value, $Res Function(BudgetData) _then) = _$BudgetDataCopyWithImpl;
@useResult
$Res call({
 String department, int year, double totalBudget, double spent, double remaining, double percentUsed, List<CategorySpend> categories, List<String> warnings, String status
});




}
/// @nodoc
class _$BudgetDataCopyWithImpl<$Res>
    implements $BudgetDataCopyWith<$Res> {
  _$BudgetDataCopyWithImpl(this._self, this._then);

  final BudgetData _self;
  final $Res Function(BudgetData) _then;

/// Create a copy of BudgetData
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? department = null,Object? year = null,Object? totalBudget = null,Object? spent = null,Object? remaining = null,Object? percentUsed = null,Object? categories = null,Object? warnings = null,Object? status = null,}) {
  return _then(_self.copyWith(
department: null == department ? _self.department : department // ignore: cast_nullable_to_non_nullable
as String,year: null == year ? _self.year : year // ignore: cast_nullable_to_non_nullable
as int,totalBudget: null == totalBudget ? _self.totalBudget : totalBudget // ignore: cast_nullable_to_non_nullable
as double,spent: null == spent ? _self.spent : spent // ignore: cast_nullable_to_non_nullable
as double,remaining: null == remaining ? _self.remaining : remaining // ignore: cast_nullable_to_non_nullable
as double,percentUsed: null == percentUsed ? _self.percentUsed : percentUsed // ignore: cast_nullable_to_non_nullable
as double,categories: null == categories ? _self.categories : categories // ignore: cast_nullable_to_non_nullable
as List<CategorySpend>,warnings: null == warnings ? _self.warnings : warnings // ignore: cast_nullable_to_non_nullable
as List<String>,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [BudgetData].
extension BudgetDataPatterns on BudgetData {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BudgetData value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BudgetData() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BudgetData value)  $default,){
final _that = this;
switch (_that) {
case _BudgetData():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BudgetData value)?  $default,){
final _that = this;
switch (_that) {
case _BudgetData() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String department,  int year,  double totalBudget,  double spent,  double remaining,  double percentUsed,  List<CategorySpend> categories,  List<String> warnings,  String status)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BudgetData() when $default != null:
return $default(_that.department,_that.year,_that.totalBudget,_that.spent,_that.remaining,_that.percentUsed,_that.categories,_that.warnings,_that.status);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String department,  int year,  double totalBudget,  double spent,  double remaining,  double percentUsed,  List<CategorySpend> categories,  List<String> warnings,  String status)  $default,) {final _that = this;
switch (_that) {
case _BudgetData():
return $default(_that.department,_that.year,_that.totalBudget,_that.spent,_that.remaining,_that.percentUsed,_that.categories,_that.warnings,_that.status);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String department,  int year,  double totalBudget,  double spent,  double remaining,  double percentUsed,  List<CategorySpend> categories,  List<String> warnings,  String status)?  $default,) {final _that = this;
switch (_that) {
case _BudgetData() when $default != null:
return $default(_that.department,_that.year,_that.totalBudget,_that.spent,_that.remaining,_that.percentUsed,_that.categories,_that.warnings,_that.status);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BudgetData implements BudgetData {
  const _BudgetData({required this.department, required this.year, required this.totalBudget, required this.spent, required this.remaining, required this.percentUsed, final  List<CategorySpend> categories = const [], final  List<String> warnings = const [], this.status = 'APPROVED'}): _categories = categories,_warnings = warnings;
  factory _BudgetData.fromJson(Map<String, dynamic> json) => _$BudgetDataFromJson(json);

@override final  String department;
@override final  int year;
@override final  double totalBudget;
@override final  double spent;
@override final  double remaining;
@override final  double percentUsed;
 final  List<CategorySpend> _categories;
@override@JsonKey() List<CategorySpend> get categories {
  if (_categories is EqualUnmodifiableListView) return _categories;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_categories);
}

 final  List<String> _warnings;
@override@JsonKey() List<String> get warnings {
  if (_warnings is EqualUnmodifiableListView) return _warnings;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_warnings);
}

@override@JsonKey() final  String status;

/// Create a copy of BudgetData
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BudgetDataCopyWith<_BudgetData> get copyWith => __$BudgetDataCopyWithImpl<_BudgetData>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BudgetDataToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BudgetData&&(identical(other.department, department) || other.department == department)&&(identical(other.year, year) || other.year == year)&&(identical(other.totalBudget, totalBudget) || other.totalBudget == totalBudget)&&(identical(other.spent, spent) || other.spent == spent)&&(identical(other.remaining, remaining) || other.remaining == remaining)&&(identical(other.percentUsed, percentUsed) || other.percentUsed == percentUsed)&&const DeepCollectionEquality().equals(other._categories, _categories)&&const DeepCollectionEquality().equals(other._warnings, _warnings)&&(identical(other.status, status) || other.status == status));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,department,year,totalBudget,spent,remaining,percentUsed,const DeepCollectionEquality().hash(_categories),const DeepCollectionEquality().hash(_warnings),status);

@override
String toString() {
  return 'BudgetData(department: $department, year: $year, totalBudget: $totalBudget, spent: $spent, remaining: $remaining, percentUsed: $percentUsed, categories: $categories, warnings: $warnings, status: $status)';
}


}

/// @nodoc
abstract mixin class _$BudgetDataCopyWith<$Res> implements $BudgetDataCopyWith<$Res> {
  factory _$BudgetDataCopyWith(_BudgetData value, $Res Function(_BudgetData) _then) = __$BudgetDataCopyWithImpl;
@override @useResult
$Res call({
 String department, int year, double totalBudget, double spent, double remaining, double percentUsed, List<CategorySpend> categories, List<String> warnings, String status
});




}
/// @nodoc
class __$BudgetDataCopyWithImpl<$Res>
    implements _$BudgetDataCopyWith<$Res> {
  __$BudgetDataCopyWithImpl(this._self, this._then);

  final _BudgetData _self;
  final $Res Function(_BudgetData) _then;

/// Create a copy of BudgetData
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? department = null,Object? year = null,Object? totalBudget = null,Object? spent = null,Object? remaining = null,Object? percentUsed = null,Object? categories = null,Object? warnings = null,Object? status = null,}) {
  return _then(_BudgetData(
department: null == department ? _self.department : department // ignore: cast_nullable_to_non_nullable
as String,year: null == year ? _self.year : year // ignore: cast_nullable_to_non_nullable
as int,totalBudget: null == totalBudget ? _self.totalBudget : totalBudget // ignore: cast_nullable_to_non_nullable
as double,spent: null == spent ? _self.spent : spent // ignore: cast_nullable_to_non_nullable
as double,remaining: null == remaining ? _self.remaining : remaining // ignore: cast_nullable_to_non_nullable
as double,percentUsed: null == percentUsed ? _self.percentUsed : percentUsed // ignore: cast_nullable_to_non_nullable
as double,categories: null == categories ? _self._categories : categories // ignore: cast_nullable_to_non_nullable
as List<CategorySpend>,warnings: null == warnings ? _self._warnings : warnings // ignore: cast_nullable_to_non_nullable
as List<String>,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$CategorySpend {

 String get category; double get allocated; double get spent; double get percentUsed;
/// Create a copy of CategorySpend
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$CategorySpendCopyWith<CategorySpend> get copyWith => _$CategorySpendCopyWithImpl<CategorySpend>(this as CategorySpend, _$identity);

  /// Serializes this CategorySpend to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is CategorySpend&&(identical(other.category, category) || other.category == category)&&(identical(other.allocated, allocated) || other.allocated == allocated)&&(identical(other.spent, spent) || other.spent == spent)&&(identical(other.percentUsed, percentUsed) || other.percentUsed == percentUsed));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,category,allocated,spent,percentUsed);

@override
String toString() {
  return 'CategorySpend(category: $category, allocated: $allocated, spent: $spent, percentUsed: $percentUsed)';
}


}

/// @nodoc
abstract mixin class $CategorySpendCopyWith<$Res>  {
  factory $CategorySpendCopyWith(CategorySpend value, $Res Function(CategorySpend) _then) = _$CategorySpendCopyWithImpl;
@useResult
$Res call({
 String category, double allocated, double spent, double percentUsed
});




}
/// @nodoc
class _$CategorySpendCopyWithImpl<$Res>
    implements $CategorySpendCopyWith<$Res> {
  _$CategorySpendCopyWithImpl(this._self, this._then);

  final CategorySpend _self;
  final $Res Function(CategorySpend) _then;

/// Create a copy of CategorySpend
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? category = null,Object? allocated = null,Object? spent = null,Object? percentUsed = null,}) {
  return _then(_self.copyWith(
category: null == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String,allocated: null == allocated ? _self.allocated : allocated // ignore: cast_nullable_to_non_nullable
as double,spent: null == spent ? _self.spent : spent // ignore: cast_nullable_to_non_nullable
as double,percentUsed: null == percentUsed ? _self.percentUsed : percentUsed // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [CategorySpend].
extension CategorySpendPatterns on CategorySpend {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _CategorySpend value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _CategorySpend() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _CategorySpend value)  $default,){
final _that = this;
switch (_that) {
case _CategorySpend():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _CategorySpend value)?  $default,){
final _that = this;
switch (_that) {
case _CategorySpend() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String category,  double allocated,  double spent,  double percentUsed)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _CategorySpend() when $default != null:
return $default(_that.category,_that.allocated,_that.spent,_that.percentUsed);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String category,  double allocated,  double spent,  double percentUsed)  $default,) {final _that = this;
switch (_that) {
case _CategorySpend():
return $default(_that.category,_that.allocated,_that.spent,_that.percentUsed);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String category,  double allocated,  double spent,  double percentUsed)?  $default,) {final _that = this;
switch (_that) {
case _CategorySpend() when $default != null:
return $default(_that.category,_that.allocated,_that.spent,_that.percentUsed);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _CategorySpend implements CategorySpend {
  const _CategorySpend({required this.category, required this.allocated, required this.spent, required this.percentUsed});
  factory _CategorySpend.fromJson(Map<String, dynamic> json) => _$CategorySpendFromJson(json);

@override final  String category;
@override final  double allocated;
@override final  double spent;
@override final  double percentUsed;

/// Create a copy of CategorySpend
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$CategorySpendCopyWith<_CategorySpend> get copyWith => __$CategorySpendCopyWithImpl<_CategorySpend>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$CategorySpendToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _CategorySpend&&(identical(other.category, category) || other.category == category)&&(identical(other.allocated, allocated) || other.allocated == allocated)&&(identical(other.spent, spent) || other.spent == spent)&&(identical(other.percentUsed, percentUsed) || other.percentUsed == percentUsed));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,category,allocated,spent,percentUsed);

@override
String toString() {
  return 'CategorySpend(category: $category, allocated: $allocated, spent: $spent, percentUsed: $percentUsed)';
}


}

/// @nodoc
abstract mixin class _$CategorySpendCopyWith<$Res> implements $CategorySpendCopyWith<$Res> {
  factory _$CategorySpendCopyWith(_CategorySpend value, $Res Function(_CategorySpend) _then) = __$CategorySpendCopyWithImpl;
@override @useResult
$Res call({
 String category, double allocated, double spent, double percentUsed
});




}
/// @nodoc
class __$CategorySpendCopyWithImpl<$Res>
    implements _$CategorySpendCopyWith<$Res> {
  __$CategorySpendCopyWithImpl(this._self, this._then);

  final _CategorySpend _self;
  final $Res Function(_CategorySpend) _then;

/// Create a copy of CategorySpend
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? category = null,Object? allocated = null,Object? spent = null,Object? percentUsed = null,}) {
  return _then(_CategorySpend(
category: null == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String,allocated: null == allocated ? _self.allocated : allocated // ignore: cast_nullable_to_non_nullable
as double,spent: null == spent ? _self.spent : spent // ignore: cast_nullable_to_non_nullable
as double,percentUsed: null == percentUsed ? _self.percentUsed : percentUsed // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$QuarterlyReport {

 String get quarter; int get year; double get revenue; double get arr; double get netIncome; double? get revenueGrowth; double? get arrGrowth; double? get netIncomeGrowth; ARRMovement? get arrMovement; List<SegmentRevenue> get revenueBySegment; List<KPI> get kpis;
/// Create a copy of QuarterlyReport
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$QuarterlyReportCopyWith<QuarterlyReport> get copyWith => _$QuarterlyReportCopyWithImpl<QuarterlyReport>(this as QuarterlyReport, _$identity);

  /// Serializes this QuarterlyReport to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is QuarterlyReport&&(identical(other.quarter, quarter) || other.quarter == quarter)&&(identical(other.year, year) || other.year == year)&&(identical(other.revenue, revenue) || other.revenue == revenue)&&(identical(other.arr, arr) || other.arr == arr)&&(identical(other.netIncome, netIncome) || other.netIncome == netIncome)&&(identical(other.revenueGrowth, revenueGrowth) || other.revenueGrowth == revenueGrowth)&&(identical(other.arrGrowth, arrGrowth) || other.arrGrowth == arrGrowth)&&(identical(other.netIncomeGrowth, netIncomeGrowth) || other.netIncomeGrowth == netIncomeGrowth)&&(identical(other.arrMovement, arrMovement) || other.arrMovement == arrMovement)&&const DeepCollectionEquality().equals(other.revenueBySegment, revenueBySegment)&&const DeepCollectionEquality().equals(other.kpis, kpis));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,quarter,year,revenue,arr,netIncome,revenueGrowth,arrGrowth,netIncomeGrowth,arrMovement,const DeepCollectionEquality().hash(revenueBySegment),const DeepCollectionEquality().hash(kpis));

@override
String toString() {
  return 'QuarterlyReport(quarter: $quarter, year: $year, revenue: $revenue, arr: $arr, netIncome: $netIncome, revenueGrowth: $revenueGrowth, arrGrowth: $arrGrowth, netIncomeGrowth: $netIncomeGrowth, arrMovement: $arrMovement, revenueBySegment: $revenueBySegment, kpis: $kpis)';
}


}

/// @nodoc
abstract mixin class $QuarterlyReportCopyWith<$Res>  {
  factory $QuarterlyReportCopyWith(QuarterlyReport value, $Res Function(QuarterlyReport) _then) = _$QuarterlyReportCopyWithImpl;
@useResult
$Res call({
 String quarter, int year, double revenue, double arr, double netIncome, double? revenueGrowth, double? arrGrowth, double? netIncomeGrowth, ARRMovement? arrMovement, List<SegmentRevenue> revenueBySegment, List<KPI> kpis
});


$ARRMovementCopyWith<$Res>? get arrMovement;

}
/// @nodoc
class _$QuarterlyReportCopyWithImpl<$Res>
    implements $QuarterlyReportCopyWith<$Res> {
  _$QuarterlyReportCopyWithImpl(this._self, this._then);

  final QuarterlyReport _self;
  final $Res Function(QuarterlyReport) _then;

/// Create a copy of QuarterlyReport
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? quarter = null,Object? year = null,Object? revenue = null,Object? arr = null,Object? netIncome = null,Object? revenueGrowth = freezed,Object? arrGrowth = freezed,Object? netIncomeGrowth = freezed,Object? arrMovement = freezed,Object? revenueBySegment = null,Object? kpis = null,}) {
  return _then(_self.copyWith(
quarter: null == quarter ? _self.quarter : quarter // ignore: cast_nullable_to_non_nullable
as String,year: null == year ? _self.year : year // ignore: cast_nullable_to_non_nullable
as int,revenue: null == revenue ? _self.revenue : revenue // ignore: cast_nullable_to_non_nullable
as double,arr: null == arr ? _self.arr : arr // ignore: cast_nullable_to_non_nullable
as double,netIncome: null == netIncome ? _self.netIncome : netIncome // ignore: cast_nullable_to_non_nullable
as double,revenueGrowth: freezed == revenueGrowth ? _self.revenueGrowth : revenueGrowth // ignore: cast_nullable_to_non_nullable
as double?,arrGrowth: freezed == arrGrowth ? _self.arrGrowth : arrGrowth // ignore: cast_nullable_to_non_nullable
as double?,netIncomeGrowth: freezed == netIncomeGrowth ? _self.netIncomeGrowth : netIncomeGrowth // ignore: cast_nullable_to_non_nullable
as double?,arrMovement: freezed == arrMovement ? _self.arrMovement : arrMovement // ignore: cast_nullable_to_non_nullable
as ARRMovement?,revenueBySegment: null == revenueBySegment ? _self.revenueBySegment : revenueBySegment // ignore: cast_nullable_to_non_nullable
as List<SegmentRevenue>,kpis: null == kpis ? _self.kpis : kpis // ignore: cast_nullable_to_non_nullable
as List<KPI>,
  ));
}
/// Create a copy of QuarterlyReport
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ARRMovementCopyWith<$Res>? get arrMovement {
    if (_self.arrMovement == null) {
    return null;
  }

  return $ARRMovementCopyWith<$Res>(_self.arrMovement!, (value) {
    return _then(_self.copyWith(arrMovement: value));
  });
}
}


/// Adds pattern-matching-related methods to [QuarterlyReport].
extension QuarterlyReportPatterns on QuarterlyReport {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _QuarterlyReport value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _QuarterlyReport() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _QuarterlyReport value)  $default,){
final _that = this;
switch (_that) {
case _QuarterlyReport():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _QuarterlyReport value)?  $default,){
final _that = this;
switch (_that) {
case _QuarterlyReport() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String quarter,  int year,  double revenue,  double arr,  double netIncome,  double? revenueGrowth,  double? arrGrowth,  double? netIncomeGrowth,  ARRMovement? arrMovement,  List<SegmentRevenue> revenueBySegment,  List<KPI> kpis)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _QuarterlyReport() when $default != null:
return $default(_that.quarter,_that.year,_that.revenue,_that.arr,_that.netIncome,_that.revenueGrowth,_that.arrGrowth,_that.netIncomeGrowth,_that.arrMovement,_that.revenueBySegment,_that.kpis);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String quarter,  int year,  double revenue,  double arr,  double netIncome,  double? revenueGrowth,  double? arrGrowth,  double? netIncomeGrowth,  ARRMovement? arrMovement,  List<SegmentRevenue> revenueBySegment,  List<KPI> kpis)  $default,) {final _that = this;
switch (_that) {
case _QuarterlyReport():
return $default(_that.quarter,_that.year,_that.revenue,_that.arr,_that.netIncome,_that.revenueGrowth,_that.arrGrowth,_that.netIncomeGrowth,_that.arrMovement,_that.revenueBySegment,_that.kpis);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String quarter,  int year,  double revenue,  double arr,  double netIncome,  double? revenueGrowth,  double? arrGrowth,  double? netIncomeGrowth,  ARRMovement? arrMovement,  List<SegmentRevenue> revenueBySegment,  List<KPI> kpis)?  $default,) {final _that = this;
switch (_that) {
case _QuarterlyReport() when $default != null:
return $default(_that.quarter,_that.year,_that.revenue,_that.arr,_that.netIncome,_that.revenueGrowth,_that.arrGrowth,_that.netIncomeGrowth,_that.arrMovement,_that.revenueBySegment,_that.kpis);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _QuarterlyReport implements QuarterlyReport {
  const _QuarterlyReport({required this.quarter, required this.year, required this.revenue, required this.arr, required this.netIncome, this.revenueGrowth, this.arrGrowth, this.netIncomeGrowth, this.arrMovement, final  List<SegmentRevenue> revenueBySegment = const [], final  List<KPI> kpis = const []}): _revenueBySegment = revenueBySegment,_kpis = kpis;
  factory _QuarterlyReport.fromJson(Map<String, dynamic> json) => _$QuarterlyReportFromJson(json);

@override final  String quarter;
@override final  int year;
@override final  double revenue;
@override final  double arr;
@override final  double netIncome;
@override final  double? revenueGrowth;
@override final  double? arrGrowth;
@override final  double? netIncomeGrowth;
@override final  ARRMovement? arrMovement;
 final  List<SegmentRevenue> _revenueBySegment;
@override@JsonKey() List<SegmentRevenue> get revenueBySegment {
  if (_revenueBySegment is EqualUnmodifiableListView) return _revenueBySegment;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_revenueBySegment);
}

 final  List<KPI> _kpis;
@override@JsonKey() List<KPI> get kpis {
  if (_kpis is EqualUnmodifiableListView) return _kpis;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_kpis);
}


/// Create a copy of QuarterlyReport
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$QuarterlyReportCopyWith<_QuarterlyReport> get copyWith => __$QuarterlyReportCopyWithImpl<_QuarterlyReport>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$QuarterlyReportToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _QuarterlyReport&&(identical(other.quarter, quarter) || other.quarter == quarter)&&(identical(other.year, year) || other.year == year)&&(identical(other.revenue, revenue) || other.revenue == revenue)&&(identical(other.arr, arr) || other.arr == arr)&&(identical(other.netIncome, netIncome) || other.netIncome == netIncome)&&(identical(other.revenueGrowth, revenueGrowth) || other.revenueGrowth == revenueGrowth)&&(identical(other.arrGrowth, arrGrowth) || other.arrGrowth == arrGrowth)&&(identical(other.netIncomeGrowth, netIncomeGrowth) || other.netIncomeGrowth == netIncomeGrowth)&&(identical(other.arrMovement, arrMovement) || other.arrMovement == arrMovement)&&const DeepCollectionEquality().equals(other._revenueBySegment, _revenueBySegment)&&const DeepCollectionEquality().equals(other._kpis, _kpis));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,quarter,year,revenue,arr,netIncome,revenueGrowth,arrGrowth,netIncomeGrowth,arrMovement,const DeepCollectionEquality().hash(_revenueBySegment),const DeepCollectionEquality().hash(_kpis));

@override
String toString() {
  return 'QuarterlyReport(quarter: $quarter, year: $year, revenue: $revenue, arr: $arr, netIncome: $netIncome, revenueGrowth: $revenueGrowth, arrGrowth: $arrGrowth, netIncomeGrowth: $netIncomeGrowth, arrMovement: $arrMovement, revenueBySegment: $revenueBySegment, kpis: $kpis)';
}


}

/// @nodoc
abstract mixin class _$QuarterlyReportCopyWith<$Res> implements $QuarterlyReportCopyWith<$Res> {
  factory _$QuarterlyReportCopyWith(_QuarterlyReport value, $Res Function(_QuarterlyReport) _then) = __$QuarterlyReportCopyWithImpl;
@override @useResult
$Res call({
 String quarter, int year, double revenue, double arr, double netIncome, double? revenueGrowth, double? arrGrowth, double? netIncomeGrowth, ARRMovement? arrMovement, List<SegmentRevenue> revenueBySegment, List<KPI> kpis
});


@override $ARRMovementCopyWith<$Res>? get arrMovement;

}
/// @nodoc
class __$QuarterlyReportCopyWithImpl<$Res>
    implements _$QuarterlyReportCopyWith<$Res> {
  __$QuarterlyReportCopyWithImpl(this._self, this._then);

  final _QuarterlyReport _self;
  final $Res Function(_QuarterlyReport) _then;

/// Create a copy of QuarterlyReport
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? quarter = null,Object? year = null,Object? revenue = null,Object? arr = null,Object? netIncome = null,Object? revenueGrowth = freezed,Object? arrGrowth = freezed,Object? netIncomeGrowth = freezed,Object? arrMovement = freezed,Object? revenueBySegment = null,Object? kpis = null,}) {
  return _then(_QuarterlyReport(
quarter: null == quarter ? _self.quarter : quarter // ignore: cast_nullable_to_non_nullable
as String,year: null == year ? _self.year : year // ignore: cast_nullable_to_non_nullable
as int,revenue: null == revenue ? _self.revenue : revenue // ignore: cast_nullable_to_non_nullable
as double,arr: null == arr ? _self.arr : arr // ignore: cast_nullable_to_non_nullable
as double,netIncome: null == netIncome ? _self.netIncome : netIncome // ignore: cast_nullable_to_non_nullable
as double,revenueGrowth: freezed == revenueGrowth ? _self.revenueGrowth : revenueGrowth // ignore: cast_nullable_to_non_nullable
as double?,arrGrowth: freezed == arrGrowth ? _self.arrGrowth : arrGrowth // ignore: cast_nullable_to_non_nullable
as double?,netIncomeGrowth: freezed == netIncomeGrowth ? _self.netIncomeGrowth : netIncomeGrowth // ignore: cast_nullable_to_non_nullable
as double?,arrMovement: freezed == arrMovement ? _self.arrMovement : arrMovement // ignore: cast_nullable_to_non_nullable
as ARRMovement?,revenueBySegment: null == revenueBySegment ? _self._revenueBySegment : revenueBySegment // ignore: cast_nullable_to_non_nullable
as List<SegmentRevenue>,kpis: null == kpis ? _self._kpis : kpis // ignore: cast_nullable_to_non_nullable
as List<KPI>,
  ));
}

/// Create a copy of QuarterlyReport
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ARRMovementCopyWith<$Res>? get arrMovement {
    if (_self.arrMovement == null) {
    return null;
  }

  return $ARRMovementCopyWith<$Res>(_self.arrMovement!, (value) {
    return _then(_self.copyWith(arrMovement: value));
  });
}
}


/// @nodoc
mixin _$ARRMovement {

 double get starting; double get newBusiness; double get expansion; double get churn; double get contraction; double get ending;
/// Create a copy of ARRMovement
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ARRMovementCopyWith<ARRMovement> get copyWith => _$ARRMovementCopyWithImpl<ARRMovement>(this as ARRMovement, _$identity);

  /// Serializes this ARRMovement to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ARRMovement&&(identical(other.starting, starting) || other.starting == starting)&&(identical(other.newBusiness, newBusiness) || other.newBusiness == newBusiness)&&(identical(other.expansion, expansion) || other.expansion == expansion)&&(identical(other.churn, churn) || other.churn == churn)&&(identical(other.contraction, contraction) || other.contraction == contraction)&&(identical(other.ending, ending) || other.ending == ending));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,starting,newBusiness,expansion,churn,contraction,ending);

@override
String toString() {
  return 'ARRMovement(starting: $starting, newBusiness: $newBusiness, expansion: $expansion, churn: $churn, contraction: $contraction, ending: $ending)';
}


}

/// @nodoc
abstract mixin class $ARRMovementCopyWith<$Res>  {
  factory $ARRMovementCopyWith(ARRMovement value, $Res Function(ARRMovement) _then) = _$ARRMovementCopyWithImpl;
@useResult
$Res call({
 double starting, double newBusiness, double expansion, double churn, double contraction, double ending
});




}
/// @nodoc
class _$ARRMovementCopyWithImpl<$Res>
    implements $ARRMovementCopyWith<$Res> {
  _$ARRMovementCopyWithImpl(this._self, this._then);

  final ARRMovement _self;
  final $Res Function(ARRMovement) _then;

/// Create a copy of ARRMovement
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? starting = null,Object? newBusiness = null,Object? expansion = null,Object? churn = null,Object? contraction = null,Object? ending = null,}) {
  return _then(_self.copyWith(
starting: null == starting ? _self.starting : starting // ignore: cast_nullable_to_non_nullable
as double,newBusiness: null == newBusiness ? _self.newBusiness : newBusiness // ignore: cast_nullable_to_non_nullable
as double,expansion: null == expansion ? _self.expansion : expansion // ignore: cast_nullable_to_non_nullable
as double,churn: null == churn ? _self.churn : churn // ignore: cast_nullable_to_non_nullable
as double,contraction: null == contraction ? _self.contraction : contraction // ignore: cast_nullable_to_non_nullable
as double,ending: null == ending ? _self.ending : ending // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [ARRMovement].
extension ARRMovementPatterns on ARRMovement {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ARRMovement value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ARRMovement() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ARRMovement value)  $default,){
final _that = this;
switch (_that) {
case _ARRMovement():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ARRMovement value)?  $default,){
final _that = this;
switch (_that) {
case _ARRMovement() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double starting,  double newBusiness,  double expansion,  double churn,  double contraction,  double ending)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ARRMovement() when $default != null:
return $default(_that.starting,_that.newBusiness,_that.expansion,_that.churn,_that.contraction,_that.ending);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double starting,  double newBusiness,  double expansion,  double churn,  double contraction,  double ending)  $default,) {final _that = this;
switch (_that) {
case _ARRMovement():
return $default(_that.starting,_that.newBusiness,_that.expansion,_that.churn,_that.contraction,_that.ending);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double starting,  double newBusiness,  double expansion,  double churn,  double contraction,  double ending)?  $default,) {final _that = this;
switch (_that) {
case _ARRMovement() when $default != null:
return $default(_that.starting,_that.newBusiness,_that.expansion,_that.churn,_that.contraction,_that.ending);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ARRMovement implements ARRMovement {
  const _ARRMovement({required this.starting, required this.newBusiness, required this.expansion, required this.churn, required this.contraction, required this.ending});
  factory _ARRMovement.fromJson(Map<String, dynamic> json) => _$ARRMovementFromJson(json);

@override final  double starting;
@override final  double newBusiness;
@override final  double expansion;
@override final  double churn;
@override final  double contraction;
@override final  double ending;

/// Create a copy of ARRMovement
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ARRMovementCopyWith<_ARRMovement> get copyWith => __$ARRMovementCopyWithImpl<_ARRMovement>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ARRMovementToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ARRMovement&&(identical(other.starting, starting) || other.starting == starting)&&(identical(other.newBusiness, newBusiness) || other.newBusiness == newBusiness)&&(identical(other.expansion, expansion) || other.expansion == expansion)&&(identical(other.churn, churn) || other.churn == churn)&&(identical(other.contraction, contraction) || other.contraction == contraction)&&(identical(other.ending, ending) || other.ending == ending));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,starting,newBusiness,expansion,churn,contraction,ending);

@override
String toString() {
  return 'ARRMovement(starting: $starting, newBusiness: $newBusiness, expansion: $expansion, churn: $churn, contraction: $contraction, ending: $ending)';
}


}

/// @nodoc
abstract mixin class _$ARRMovementCopyWith<$Res> implements $ARRMovementCopyWith<$Res> {
  factory _$ARRMovementCopyWith(_ARRMovement value, $Res Function(_ARRMovement) _then) = __$ARRMovementCopyWithImpl;
@override @useResult
$Res call({
 double starting, double newBusiness, double expansion, double churn, double contraction, double ending
});




}
/// @nodoc
class __$ARRMovementCopyWithImpl<$Res>
    implements _$ARRMovementCopyWith<$Res> {
  __$ARRMovementCopyWithImpl(this._self, this._then);

  final _ARRMovement _self;
  final $Res Function(_ARRMovement) _then;

/// Create a copy of ARRMovement
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? starting = null,Object? newBusiness = null,Object? expansion = null,Object? churn = null,Object? contraction = null,Object? ending = null,}) {
  return _then(_ARRMovement(
starting: null == starting ? _self.starting : starting // ignore: cast_nullable_to_non_nullable
as double,newBusiness: null == newBusiness ? _self.newBusiness : newBusiness // ignore: cast_nullable_to_non_nullable
as double,expansion: null == expansion ? _self.expansion : expansion // ignore: cast_nullable_to_non_nullable
as double,churn: null == churn ? _self.churn : churn // ignore: cast_nullable_to_non_nullable
as double,contraction: null == contraction ? _self.contraction : contraction // ignore: cast_nullable_to_non_nullable
as double,ending: null == ending ? _self.ending : ending // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$SegmentRevenue {

 String get segment; double get revenue; double get percent;
/// Create a copy of SegmentRevenue
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SegmentRevenueCopyWith<SegmentRevenue> get copyWith => _$SegmentRevenueCopyWithImpl<SegmentRevenue>(this as SegmentRevenue, _$identity);

  /// Serializes this SegmentRevenue to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SegmentRevenue&&(identical(other.segment, segment) || other.segment == segment)&&(identical(other.revenue, revenue) || other.revenue == revenue)&&(identical(other.percent, percent) || other.percent == percent));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,segment,revenue,percent);

@override
String toString() {
  return 'SegmentRevenue(segment: $segment, revenue: $revenue, percent: $percent)';
}


}

/// @nodoc
abstract mixin class $SegmentRevenueCopyWith<$Res>  {
  factory $SegmentRevenueCopyWith(SegmentRevenue value, $Res Function(SegmentRevenue) _then) = _$SegmentRevenueCopyWithImpl;
@useResult
$Res call({
 String segment, double revenue, double percent
});




}
/// @nodoc
class _$SegmentRevenueCopyWithImpl<$Res>
    implements $SegmentRevenueCopyWith<$Res> {
  _$SegmentRevenueCopyWithImpl(this._self, this._then);

  final SegmentRevenue _self;
  final $Res Function(SegmentRevenue) _then;

/// Create a copy of SegmentRevenue
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? segment = null,Object? revenue = null,Object? percent = null,}) {
  return _then(_self.copyWith(
segment: null == segment ? _self.segment : segment // ignore: cast_nullable_to_non_nullable
as String,revenue: null == revenue ? _self.revenue : revenue // ignore: cast_nullable_to_non_nullable
as double,percent: null == percent ? _self.percent : percent // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [SegmentRevenue].
extension SegmentRevenuePatterns on SegmentRevenue {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SegmentRevenue value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SegmentRevenue() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SegmentRevenue value)  $default,){
final _that = this;
switch (_that) {
case _SegmentRevenue():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SegmentRevenue value)?  $default,){
final _that = this;
switch (_that) {
case _SegmentRevenue() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String segment,  double revenue,  double percent)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SegmentRevenue() when $default != null:
return $default(_that.segment,_that.revenue,_that.percent);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String segment,  double revenue,  double percent)  $default,) {final _that = this;
switch (_that) {
case _SegmentRevenue():
return $default(_that.segment,_that.revenue,_that.percent);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String segment,  double revenue,  double percent)?  $default,) {final _that = this;
switch (_that) {
case _SegmentRevenue() when $default != null:
return $default(_that.segment,_that.revenue,_that.percent);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SegmentRevenue implements SegmentRevenue {
  const _SegmentRevenue({required this.segment, required this.revenue, required this.percent});
  factory _SegmentRevenue.fromJson(Map<String, dynamic> json) => _$SegmentRevenueFromJson(json);

@override final  String segment;
@override final  double revenue;
@override final  double percent;

/// Create a copy of SegmentRevenue
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SegmentRevenueCopyWith<_SegmentRevenue> get copyWith => __$SegmentRevenueCopyWithImpl<_SegmentRevenue>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SegmentRevenueToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SegmentRevenue&&(identical(other.segment, segment) || other.segment == segment)&&(identical(other.revenue, revenue) || other.revenue == revenue)&&(identical(other.percent, percent) || other.percent == percent));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,segment,revenue,percent);

@override
String toString() {
  return 'SegmentRevenue(segment: $segment, revenue: $revenue, percent: $percent)';
}


}

/// @nodoc
abstract mixin class _$SegmentRevenueCopyWith<$Res> implements $SegmentRevenueCopyWith<$Res> {
  factory _$SegmentRevenueCopyWith(_SegmentRevenue value, $Res Function(_SegmentRevenue) _then) = __$SegmentRevenueCopyWithImpl;
@override @useResult
$Res call({
 String segment, double revenue, double percent
});




}
/// @nodoc
class __$SegmentRevenueCopyWithImpl<$Res>
    implements _$SegmentRevenueCopyWith<$Res> {
  __$SegmentRevenueCopyWithImpl(this._self, this._then);

  final _SegmentRevenue _self;
  final $Res Function(_SegmentRevenue) _then;

/// Create a copy of SegmentRevenue
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? segment = null,Object? revenue = null,Object? percent = null,}) {
  return _then(_SegmentRevenue(
segment: null == segment ? _self.segment : segment // ignore: cast_nullable_to_non_nullable
as String,revenue: null == revenue ? _self.revenue : revenue // ignore: cast_nullable_to_non_nullable
as double,percent: null == percent ? _self.percent : percent // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$KPI {

 String get name; String get value; String? get change; String? get trend; String? get unit;
/// Create a copy of KPI
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$KPICopyWith<KPI> get copyWith => _$KPICopyWithImpl<KPI>(this as KPI, _$identity);

  /// Serializes this KPI to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is KPI&&(identical(other.name, name) || other.name == name)&&(identical(other.value, value) || other.value == value)&&(identical(other.change, change) || other.change == change)&&(identical(other.trend, trend) || other.trend == trend)&&(identical(other.unit, unit) || other.unit == unit));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,value,change,trend,unit);

@override
String toString() {
  return 'KPI(name: $name, value: $value, change: $change, trend: $trend, unit: $unit)';
}


}

/// @nodoc
abstract mixin class $KPICopyWith<$Res>  {
  factory $KPICopyWith(KPI value, $Res Function(KPI) _then) = _$KPICopyWithImpl;
@useResult
$Res call({
 String name, String value, String? change, String? trend, String? unit
});




}
/// @nodoc
class _$KPICopyWithImpl<$Res>
    implements $KPICopyWith<$Res> {
  _$KPICopyWithImpl(this._self, this._then);

  final KPI _self;
  final $Res Function(KPI) _then;

/// Create a copy of KPI
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? value = null,Object? change = freezed,Object? trend = freezed,Object? unit = freezed,}) {
  return _then(_self.copyWith(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,value: null == value ? _self.value : value // ignore: cast_nullable_to_non_nullable
as String,change: freezed == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as String?,trend: freezed == trend ? _self.trend : trend // ignore: cast_nullable_to_non_nullable
as String?,unit: freezed == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [KPI].
extension KPIPatterns on KPI {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _KPI value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _KPI() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _KPI value)  $default,){
final _that = this;
switch (_that) {
case _KPI():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _KPI value)?  $default,){
final _that = this;
switch (_that) {
case _KPI() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  String value,  String? change,  String? trend,  String? unit)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _KPI() when $default != null:
return $default(_that.name,_that.value,_that.change,_that.trend,_that.unit);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  String value,  String? change,  String? trend,  String? unit)  $default,) {final _that = this;
switch (_that) {
case _KPI():
return $default(_that.name,_that.value,_that.change,_that.trend,_that.unit);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  String value,  String? change,  String? trend,  String? unit)?  $default,) {final _that = this;
switch (_that) {
case _KPI() when $default != null:
return $default(_that.name,_that.value,_that.change,_that.trend,_that.unit);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _KPI implements KPI {
  const _KPI({required this.name, required this.value, this.change, this.trend, this.unit});
  factory _KPI.fromJson(Map<String, dynamic> json) => _$KPIFromJson(json);

@override final  String name;
@override final  String value;
@override final  String? change;
@override final  String? trend;
@override final  String? unit;

/// Create a copy of KPI
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$KPICopyWith<_KPI> get copyWith => __$KPICopyWithImpl<_KPI>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$KPIToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _KPI&&(identical(other.name, name) || other.name == name)&&(identical(other.value, value) || other.value == value)&&(identical(other.change, change) || other.change == change)&&(identical(other.trend, trend) || other.trend == trend)&&(identical(other.unit, unit) || other.unit == unit));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,value,change,trend,unit);

@override
String toString() {
  return 'KPI(name: $name, value: $value, change: $change, trend: $trend, unit: $unit)';
}


}

/// @nodoc
abstract mixin class _$KPICopyWith<$Res> implements $KPICopyWith<$Res> {
  factory _$KPICopyWith(_KPI value, $Res Function(_KPI) _then) = __$KPICopyWithImpl;
@override @useResult
$Res call({
 String name, String value, String? change, String? trend, String? unit
});




}
/// @nodoc
class __$KPICopyWithImpl<$Res>
    implements _$KPICopyWith<$Res> {
  __$KPICopyWithImpl(this._self, this._then);

  final _KPI _self;
  final $Res Function(_KPI) _then;

/// Create a copy of KPI
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? value = null,Object? change = freezed,Object? trend = freezed,Object? unit = freezed,}) {
  return _then(_KPI(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,value: null == value ? _self.value : value // ignore: cast_nullable_to_non_nullable
as String,change: freezed == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as String?,trend: freezed == trend ? _self.trend : trend // ignore: cast_nullable_to_non_nullable
as String?,unit: freezed == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$WaterfallItem {

 String get label; double get value; bool get isTotal; bool get isSubtotal; String? get color;
/// Create a copy of WaterfallItem
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$WaterfallItemCopyWith<WaterfallItem> get copyWith => _$WaterfallItemCopyWithImpl<WaterfallItem>(this as WaterfallItem, _$identity);

  /// Serializes this WaterfallItem to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is WaterfallItem&&(identical(other.label, label) || other.label == label)&&(identical(other.value, value) || other.value == value)&&(identical(other.isTotal, isTotal) || other.isTotal == isTotal)&&(identical(other.isSubtotal, isSubtotal) || other.isSubtotal == isSubtotal)&&(identical(other.color, color) || other.color == color));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,value,isTotal,isSubtotal,color);

@override
String toString() {
  return 'WaterfallItem(label: $label, value: $value, isTotal: $isTotal, isSubtotal: $isSubtotal, color: $color)';
}


}

/// @nodoc
abstract mixin class $WaterfallItemCopyWith<$Res>  {
  factory $WaterfallItemCopyWith(WaterfallItem value, $Res Function(WaterfallItem) _then) = _$WaterfallItemCopyWithImpl;
@useResult
$Res call({
 String label, double value, bool isTotal, bool isSubtotal, String? color
});




}
/// @nodoc
class _$WaterfallItemCopyWithImpl<$Res>
    implements $WaterfallItemCopyWith<$Res> {
  _$WaterfallItemCopyWithImpl(this._self, this._then);

  final WaterfallItem _self;
  final $Res Function(WaterfallItem) _then;

/// Create a copy of WaterfallItem
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? label = null,Object? value = null,Object? isTotal = null,Object? isSubtotal = null,Object? color = freezed,}) {
  return _then(_self.copyWith(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,value: null == value ? _self.value : value // ignore: cast_nullable_to_non_nullable
as double,isTotal: null == isTotal ? _self.isTotal : isTotal // ignore: cast_nullable_to_non_nullable
as bool,isSubtotal: null == isSubtotal ? _self.isSubtotal : isSubtotal // ignore: cast_nullable_to_non_nullable
as bool,color: freezed == color ? _self.color : color // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [WaterfallItem].
extension WaterfallItemPatterns on WaterfallItem {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _WaterfallItem value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _WaterfallItem() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _WaterfallItem value)  $default,){
final _that = this;
switch (_that) {
case _WaterfallItem():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _WaterfallItem value)?  $default,){
final _that = this;
switch (_that) {
case _WaterfallItem() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String label,  double value,  bool isTotal,  bool isSubtotal,  String? color)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _WaterfallItem() when $default != null:
return $default(_that.label,_that.value,_that.isTotal,_that.isSubtotal,_that.color);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String label,  double value,  bool isTotal,  bool isSubtotal,  String? color)  $default,) {final _that = this;
switch (_that) {
case _WaterfallItem():
return $default(_that.label,_that.value,_that.isTotal,_that.isSubtotal,_that.color);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String label,  double value,  bool isTotal,  bool isSubtotal,  String? color)?  $default,) {final _that = this;
switch (_that) {
case _WaterfallItem() when $default != null:
return $default(_that.label,_that.value,_that.isTotal,_that.isSubtotal,_that.color);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _WaterfallItem implements WaterfallItem {
  const _WaterfallItem({required this.label, required this.value, required this.isTotal, this.isSubtotal = false, this.color});
  factory _WaterfallItem.fromJson(Map<String, dynamic> json) => _$WaterfallItemFromJson(json);

@override final  String label;
@override final  double value;
@override final  bool isTotal;
@override@JsonKey() final  bool isSubtotal;
@override final  String? color;

/// Create a copy of WaterfallItem
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$WaterfallItemCopyWith<_WaterfallItem> get copyWith => __$WaterfallItemCopyWithImpl<_WaterfallItem>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$WaterfallItemToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _WaterfallItem&&(identical(other.label, label) || other.label == label)&&(identical(other.value, value) || other.value == value)&&(identical(other.isTotal, isTotal) || other.isTotal == isTotal)&&(identical(other.isSubtotal, isSubtotal) || other.isSubtotal == isSubtotal)&&(identical(other.color, color) || other.color == color));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,value,isTotal,isSubtotal,color);

@override
String toString() {
  return 'WaterfallItem(label: $label, value: $value, isTotal: $isTotal, isSubtotal: $isSubtotal, color: $color)';
}


}

/// @nodoc
abstract mixin class _$WaterfallItemCopyWith<$Res> implements $WaterfallItemCopyWith<$Res> {
  factory _$WaterfallItemCopyWith(_WaterfallItem value, $Res Function(_WaterfallItem) _then) = __$WaterfallItemCopyWithImpl;
@override @useResult
$Res call({
 String label, double value, bool isTotal, bool isSubtotal, String? color
});




}
/// @nodoc
class __$WaterfallItemCopyWithImpl<$Res>
    implements _$WaterfallItemCopyWith<$Res> {
  __$WaterfallItemCopyWithImpl(this._self, this._then);

  final _WaterfallItem _self;
  final $Res Function(_WaterfallItem) _then;

/// Create a copy of WaterfallItem
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? label = null,Object? value = null,Object? isTotal = null,Object? isSubtotal = null,Object? color = freezed,}) {
  return _then(_WaterfallItem(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,value: null == value ? _self.value : value // ignore: cast_nullable_to_non_nullable
as double,isTotal: null == isTotal ? _self.isTotal : isTotal // ignore: cast_nullable_to_non_nullable
as bool,isSubtotal: null == isSubtotal ? _self.isSubtotal : isSubtotal // ignore: cast_nullable_to_non_nullable
as bool,color: freezed == color ? _self.color : color // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$Customer {

 String get id; String get name; String? get industry; double? get annualRevenue; int? get employeeCount; String? get website; String get status; String? get logoUrl; DateTime? get createdAt;
/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$CustomerCopyWith<Customer> get copyWith => _$CustomerCopyWithImpl<Customer>(this as Customer, _$identity);

  /// Serializes this Customer to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Customer&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.industry, industry) || other.industry == industry)&&(identical(other.annualRevenue, annualRevenue) || other.annualRevenue == annualRevenue)&&(identical(other.employeeCount, employeeCount) || other.employeeCount == employeeCount)&&(identical(other.website, website) || other.website == website)&&(identical(other.status, status) || other.status == status)&&(identical(other.logoUrl, logoUrl) || other.logoUrl == logoUrl)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,industry,annualRevenue,employeeCount,website,status,logoUrl,createdAt);

@override
String toString() {
  return 'Customer(id: $id, name: $name, industry: $industry, annualRevenue: $annualRevenue, employeeCount: $employeeCount, website: $website, status: $status, logoUrl: $logoUrl, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class $CustomerCopyWith<$Res>  {
  factory $CustomerCopyWith(Customer value, $Res Function(Customer) _then) = _$CustomerCopyWithImpl;
@useResult
$Res call({
 String id, String name, String? industry, double? annualRevenue, int? employeeCount, String? website, String status, String? logoUrl, DateTime? createdAt
});




}
/// @nodoc
class _$CustomerCopyWithImpl<$Res>
    implements $CustomerCopyWith<$Res> {
  _$CustomerCopyWithImpl(this._self, this._then);

  final Customer _self;
  final $Res Function(Customer) _then;

/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? industry = freezed,Object? annualRevenue = freezed,Object? employeeCount = freezed,Object? website = freezed,Object? status = null,Object? logoUrl = freezed,Object? createdAt = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,industry: freezed == industry ? _self.industry : industry // ignore: cast_nullable_to_non_nullable
as String?,annualRevenue: freezed == annualRevenue ? _self.annualRevenue : annualRevenue // ignore: cast_nullable_to_non_nullable
as double?,employeeCount: freezed == employeeCount ? _self.employeeCount : employeeCount // ignore: cast_nullable_to_non_nullable
as int?,website: freezed == website ? _self.website : website // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,logoUrl: freezed == logoUrl ? _self.logoUrl : logoUrl // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [Customer].
extension CustomerPatterns on Customer {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Customer value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Customer() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Customer value)  $default,){
final _that = this;
switch (_that) {
case _Customer():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Customer value)?  $default,){
final _that = this;
switch (_that) {
case _Customer() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String? industry,  double? annualRevenue,  int? employeeCount,  String? website,  String status,  String? logoUrl,  DateTime? createdAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Customer() when $default != null:
return $default(_that.id,_that.name,_that.industry,_that.annualRevenue,_that.employeeCount,_that.website,_that.status,_that.logoUrl,_that.createdAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String? industry,  double? annualRevenue,  int? employeeCount,  String? website,  String status,  String? logoUrl,  DateTime? createdAt)  $default,) {final _that = this;
switch (_that) {
case _Customer():
return $default(_that.id,_that.name,_that.industry,_that.annualRevenue,_that.employeeCount,_that.website,_that.status,_that.logoUrl,_that.createdAt);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String? industry,  double? annualRevenue,  int? employeeCount,  String? website,  String status,  String? logoUrl,  DateTime? createdAt)?  $default,) {final _that = this;
switch (_that) {
case _Customer() when $default != null:
return $default(_that.id,_that.name,_that.industry,_that.annualRevenue,_that.employeeCount,_that.website,_that.status,_that.logoUrl,_that.createdAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Customer implements Customer {
  const _Customer({required this.id, required this.name, this.industry, this.annualRevenue, this.employeeCount, this.website, this.status = 'active', this.logoUrl, this.createdAt});
  factory _Customer.fromJson(Map<String, dynamic> json) => _$CustomerFromJson(json);

@override final  String id;
@override final  String name;
@override final  String? industry;
@override final  double? annualRevenue;
@override final  int? employeeCount;
@override final  String? website;
@override@JsonKey() final  String status;
@override final  String? logoUrl;
@override final  DateTime? createdAt;

/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$CustomerCopyWith<_Customer> get copyWith => __$CustomerCopyWithImpl<_Customer>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$CustomerToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Customer&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.industry, industry) || other.industry == industry)&&(identical(other.annualRevenue, annualRevenue) || other.annualRevenue == annualRevenue)&&(identical(other.employeeCount, employeeCount) || other.employeeCount == employeeCount)&&(identical(other.website, website) || other.website == website)&&(identical(other.status, status) || other.status == status)&&(identical(other.logoUrl, logoUrl) || other.logoUrl == logoUrl)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,industry,annualRevenue,employeeCount,website,status,logoUrl,createdAt);

@override
String toString() {
  return 'Customer(id: $id, name: $name, industry: $industry, annualRevenue: $annualRevenue, employeeCount: $employeeCount, website: $website, status: $status, logoUrl: $logoUrl, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class _$CustomerCopyWith<$Res> implements $CustomerCopyWith<$Res> {
  factory _$CustomerCopyWith(_Customer value, $Res Function(_Customer) _then) = __$CustomerCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String? industry, double? annualRevenue, int? employeeCount, String? website, String status, String? logoUrl, DateTime? createdAt
});




}
/// @nodoc
class __$CustomerCopyWithImpl<$Res>
    implements _$CustomerCopyWith<$Res> {
  __$CustomerCopyWithImpl(this._self, this._then);

  final _Customer _self;
  final $Res Function(_Customer) _then;

/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? industry = freezed,Object? annualRevenue = freezed,Object? employeeCount = freezed,Object? website = freezed,Object? status = null,Object? logoUrl = freezed,Object? createdAt = freezed,}) {
  return _then(_Customer(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,industry: freezed == industry ? _self.industry : industry // ignore: cast_nullable_to_non_nullable
as String?,annualRevenue: freezed == annualRevenue ? _self.annualRevenue : annualRevenue // ignore: cast_nullable_to_non_nullable
as double?,employeeCount: freezed == employeeCount ? _self.employeeCount : employeeCount // ignore: cast_nullable_to_non_nullable
as int?,website: freezed == website ? _self.website : website // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,logoUrl: freezed == logoUrl ? _self.logoUrl : logoUrl // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}


/// @nodoc
mixin _$Contact {

 String get id; String get name; String? get email; String? get phone; String? get title; bool get isPrimary; String? get customerId;
/// Create a copy of Contact
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ContactCopyWith<Contact> get copyWith => _$ContactCopyWithImpl<Contact>(this as Contact, _$identity);

  /// Serializes this Contact to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Contact&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.email, email) || other.email == email)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.title, title) || other.title == title)&&(identical(other.isPrimary, isPrimary) || other.isPrimary == isPrimary)&&(identical(other.customerId, customerId) || other.customerId == customerId));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,email,phone,title,isPrimary,customerId);

@override
String toString() {
  return 'Contact(id: $id, name: $name, email: $email, phone: $phone, title: $title, isPrimary: $isPrimary, customerId: $customerId)';
}


}

/// @nodoc
abstract mixin class $ContactCopyWith<$Res>  {
  factory $ContactCopyWith(Contact value, $Res Function(Contact) _then) = _$ContactCopyWithImpl;
@useResult
$Res call({
 String id, String name, String? email, String? phone, String? title, bool isPrimary, String? customerId
});




}
/// @nodoc
class _$ContactCopyWithImpl<$Res>
    implements $ContactCopyWith<$Res> {
  _$ContactCopyWithImpl(this._self, this._then);

  final Contact _self;
  final $Res Function(Contact) _then;

/// Create a copy of Contact
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? email = freezed,Object? phone = freezed,Object? title = freezed,Object? isPrimary = null,Object? customerId = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,phone: freezed == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String?,title: freezed == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String?,isPrimary: null == isPrimary ? _self.isPrimary : isPrimary // ignore: cast_nullable_to_non_nullable
as bool,customerId: freezed == customerId ? _self.customerId : customerId // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [Contact].
extension ContactPatterns on Contact {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Contact value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Contact() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Contact value)  $default,){
final _that = this;
switch (_that) {
case _Contact():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Contact value)?  $default,){
final _that = this;
switch (_that) {
case _Contact() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String? email,  String? phone,  String? title,  bool isPrimary,  String? customerId)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Contact() when $default != null:
return $default(_that.id,_that.name,_that.email,_that.phone,_that.title,_that.isPrimary,_that.customerId);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String? email,  String? phone,  String? title,  bool isPrimary,  String? customerId)  $default,) {final _that = this;
switch (_that) {
case _Contact():
return $default(_that.id,_that.name,_that.email,_that.phone,_that.title,_that.isPrimary,_that.customerId);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String? email,  String? phone,  String? title,  bool isPrimary,  String? customerId)?  $default,) {final _that = this;
switch (_that) {
case _Contact() when $default != null:
return $default(_that.id,_that.name,_that.email,_that.phone,_that.title,_that.isPrimary,_that.customerId);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Contact implements Contact {
  const _Contact({required this.id, required this.name, this.email, this.phone, this.title, this.isPrimary = false, this.customerId});
  factory _Contact.fromJson(Map<String, dynamic> json) => _$ContactFromJson(json);

@override final  String id;
@override final  String name;
@override final  String? email;
@override final  String? phone;
@override final  String? title;
@override@JsonKey() final  bool isPrimary;
@override final  String? customerId;

/// Create a copy of Contact
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ContactCopyWith<_Contact> get copyWith => __$ContactCopyWithImpl<_Contact>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ContactToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Contact&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.email, email) || other.email == email)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.title, title) || other.title == title)&&(identical(other.isPrimary, isPrimary) || other.isPrimary == isPrimary)&&(identical(other.customerId, customerId) || other.customerId == customerId));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,email,phone,title,isPrimary,customerId);

@override
String toString() {
  return 'Contact(id: $id, name: $name, email: $email, phone: $phone, title: $title, isPrimary: $isPrimary, customerId: $customerId)';
}


}

/// @nodoc
abstract mixin class _$ContactCopyWith<$Res> implements $ContactCopyWith<$Res> {
  factory _$ContactCopyWith(_Contact value, $Res Function(_Contact) _then) = __$ContactCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String? email, String? phone, String? title, bool isPrimary, String? customerId
});




}
/// @nodoc
class __$ContactCopyWithImpl<$Res>
    implements _$ContactCopyWith<$Res> {
  __$ContactCopyWithImpl(this._self, this._then);

  final _Contact _self;
  final $Res Function(_Contact) _then;

/// Create a copy of Contact
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? email = freezed,Object? phone = freezed,Object? title = freezed,Object? isPrimary = null,Object? customerId = freezed,}) {
  return _then(_Contact(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,phone: freezed == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String?,title: freezed == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String?,isPrimary: null == isPrimary ? _self.isPrimary : isPrimary // ignore: cast_nullable_to_non_nullable
as bool,customerId: freezed == customerId ? _self.customerId : customerId // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$Opportunity {

 String get id; String get name; double get amount; String get stage; String? get customerId; String? get customerName; DateTime? get closeDate; double? get probability;
/// Create a copy of Opportunity
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OpportunityCopyWith<Opportunity> get copyWith => _$OpportunityCopyWithImpl<Opportunity>(this as Opportunity, _$identity);

  /// Serializes this Opportunity to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Opportunity&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.stage, stage) || other.stage == stage)&&(identical(other.customerId, customerId) || other.customerId == customerId)&&(identical(other.customerName, customerName) || other.customerName == customerName)&&(identical(other.closeDate, closeDate) || other.closeDate == closeDate)&&(identical(other.probability, probability) || other.probability == probability));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,amount,stage,customerId,customerName,closeDate,probability);

@override
String toString() {
  return 'Opportunity(id: $id, name: $name, amount: $amount, stage: $stage, customerId: $customerId, customerName: $customerName, closeDate: $closeDate, probability: $probability)';
}


}

/// @nodoc
abstract mixin class $OpportunityCopyWith<$Res>  {
  factory $OpportunityCopyWith(Opportunity value, $Res Function(Opportunity) _then) = _$OpportunityCopyWithImpl;
@useResult
$Res call({
 String id, String name, double amount, String stage, String? customerId, String? customerName, DateTime? closeDate, double? probability
});




}
/// @nodoc
class _$OpportunityCopyWithImpl<$Res>
    implements $OpportunityCopyWith<$Res> {
  _$OpportunityCopyWithImpl(this._self, this._then);

  final Opportunity _self;
  final $Res Function(Opportunity) _then;

/// Create a copy of Opportunity
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? amount = null,Object? stage = null,Object? customerId = freezed,Object? customerName = freezed,Object? closeDate = freezed,Object? probability = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,stage: null == stage ? _self.stage : stage // ignore: cast_nullable_to_non_nullable
as String,customerId: freezed == customerId ? _self.customerId : customerId // ignore: cast_nullable_to_non_nullable
as String?,customerName: freezed == customerName ? _self.customerName : customerName // ignore: cast_nullable_to_non_nullable
as String?,closeDate: freezed == closeDate ? _self.closeDate : closeDate // ignore: cast_nullable_to_non_nullable
as DateTime?,probability: freezed == probability ? _self.probability : probability // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [Opportunity].
extension OpportunityPatterns on Opportunity {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Opportunity value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Opportunity() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Opportunity value)  $default,){
final _that = this;
switch (_that) {
case _Opportunity():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Opportunity value)?  $default,){
final _that = this;
switch (_that) {
case _Opportunity() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  double amount,  String stage,  String? customerId,  String? customerName,  DateTime? closeDate,  double? probability)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Opportunity() when $default != null:
return $default(_that.id,_that.name,_that.amount,_that.stage,_that.customerId,_that.customerName,_that.closeDate,_that.probability);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  double amount,  String stage,  String? customerId,  String? customerName,  DateTime? closeDate,  double? probability)  $default,) {final _that = this;
switch (_that) {
case _Opportunity():
return $default(_that.id,_that.name,_that.amount,_that.stage,_that.customerId,_that.customerName,_that.closeDate,_that.probability);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  double amount,  String stage,  String? customerId,  String? customerName,  DateTime? closeDate,  double? probability)?  $default,) {final _that = this;
switch (_that) {
case _Opportunity() when $default != null:
return $default(_that.id,_that.name,_that.amount,_that.stage,_that.customerId,_that.customerName,_that.closeDate,_that.probability);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Opportunity implements Opportunity {
  const _Opportunity({required this.id, required this.name, required this.amount, required this.stage, this.customerId, this.customerName, this.closeDate, this.probability});
  factory _Opportunity.fromJson(Map<String, dynamic> json) => _$OpportunityFromJson(json);

@override final  String id;
@override final  String name;
@override final  double amount;
@override final  String stage;
@override final  String? customerId;
@override final  String? customerName;
@override final  DateTime? closeDate;
@override final  double? probability;

/// Create a copy of Opportunity
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OpportunityCopyWith<_Opportunity> get copyWith => __$OpportunityCopyWithImpl<_Opportunity>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OpportunityToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Opportunity&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.stage, stage) || other.stage == stage)&&(identical(other.customerId, customerId) || other.customerId == customerId)&&(identical(other.customerName, customerName) || other.customerName == customerName)&&(identical(other.closeDate, closeDate) || other.closeDate == closeDate)&&(identical(other.probability, probability) || other.probability == probability));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,amount,stage,customerId,customerName,closeDate,probability);

@override
String toString() {
  return 'Opportunity(id: $id, name: $name, amount: $amount, stage: $stage, customerId: $customerId, customerName: $customerName, closeDate: $closeDate, probability: $probability)';
}


}

/// @nodoc
abstract mixin class _$OpportunityCopyWith<$Res> implements $OpportunityCopyWith<$Res> {
  factory _$OpportunityCopyWith(_Opportunity value, $Res Function(_Opportunity) _then) = __$OpportunityCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, double amount, String stage, String? customerId, String? customerName, DateTime? closeDate, double? probability
});




}
/// @nodoc
class __$OpportunityCopyWithImpl<$Res>
    implements _$OpportunityCopyWith<$Res> {
  __$OpportunityCopyWithImpl(this._self, this._then);

  final _Opportunity _self;
  final $Res Function(_Opportunity) _then;

/// Create a copy of Opportunity
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? amount = null,Object? stage = null,Object? customerId = freezed,Object? customerName = freezed,Object? closeDate = freezed,Object? probability = freezed,}) {
  return _then(_Opportunity(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,stage: null == stage ? _self.stage : stage // ignore: cast_nullable_to_non_nullable
as String,customerId: freezed == customerId ? _self.customerId : customerId // ignore: cast_nullable_to_non_nullable
as String?,customerName: freezed == customerName ? _self.customerName : customerName // ignore: cast_nullable_to_non_nullable
as String?,closeDate: freezed == closeDate ? _self.closeDate : closeDate // ignore: cast_nullable_to_non_nullable
as DateTime?,probability: freezed == probability ? _self.probability : probability // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$Lead {

 String get id; String get name; String? get company; int? get score; LeadStatus get status; String? get source; String? get email; String? get phone; DateTime? get createdAt; String? get ownerId; String? get ownerName;
/// Create a copy of Lead
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$LeadCopyWith<Lead> get copyWith => _$LeadCopyWithImpl<Lead>(this as Lead, _$identity);

  /// Serializes this Lead to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Lead&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.company, company) || other.company == company)&&(identical(other.score, score) || other.score == score)&&(identical(other.status, status) || other.status == status)&&(identical(other.source, source) || other.source == source)&&(identical(other.email, email) || other.email == email)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.ownerId, ownerId) || other.ownerId == ownerId)&&(identical(other.ownerName, ownerName) || other.ownerName == ownerName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,company,score,status,source,email,phone,createdAt,ownerId,ownerName);

@override
String toString() {
  return 'Lead(id: $id, name: $name, company: $company, score: $score, status: $status, source: $source, email: $email, phone: $phone, createdAt: $createdAt, ownerId: $ownerId, ownerName: $ownerName)';
}


}

/// @nodoc
abstract mixin class $LeadCopyWith<$Res>  {
  factory $LeadCopyWith(Lead value, $Res Function(Lead) _then) = _$LeadCopyWithImpl;
@useResult
$Res call({
 String id, String name, String? company, int? score, LeadStatus status, String? source, String? email, String? phone, DateTime? createdAt, String? ownerId, String? ownerName
});




}
/// @nodoc
class _$LeadCopyWithImpl<$Res>
    implements $LeadCopyWith<$Res> {
  _$LeadCopyWithImpl(this._self, this._then);

  final Lead _self;
  final $Res Function(Lead) _then;

/// Create a copy of Lead
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? company = freezed,Object? score = freezed,Object? status = null,Object? source = freezed,Object? email = freezed,Object? phone = freezed,Object? createdAt = freezed,Object? ownerId = freezed,Object? ownerName = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,company: freezed == company ? _self.company : company // ignore: cast_nullable_to_non_nullable
as String?,score: freezed == score ? _self.score : score // ignore: cast_nullable_to_non_nullable
as int?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as LeadStatus,source: freezed == source ? _self.source : source // ignore: cast_nullable_to_non_nullable
as String?,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,phone: freezed == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,ownerId: freezed == ownerId ? _self.ownerId : ownerId // ignore: cast_nullable_to_non_nullable
as String?,ownerName: freezed == ownerName ? _self.ownerName : ownerName // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [Lead].
extension LeadPatterns on Lead {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Lead value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Lead() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Lead value)  $default,){
final _that = this;
switch (_that) {
case _Lead():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Lead value)?  $default,){
final _that = this;
switch (_that) {
case _Lead() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String? company,  int? score,  LeadStatus status,  String? source,  String? email,  String? phone,  DateTime? createdAt,  String? ownerId,  String? ownerName)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Lead() when $default != null:
return $default(_that.id,_that.name,_that.company,_that.score,_that.status,_that.source,_that.email,_that.phone,_that.createdAt,_that.ownerId,_that.ownerName);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String? company,  int? score,  LeadStatus status,  String? source,  String? email,  String? phone,  DateTime? createdAt,  String? ownerId,  String? ownerName)  $default,) {final _that = this;
switch (_that) {
case _Lead():
return $default(_that.id,_that.name,_that.company,_that.score,_that.status,_that.source,_that.email,_that.phone,_that.createdAt,_that.ownerId,_that.ownerName);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String? company,  int? score,  LeadStatus status,  String? source,  String? email,  String? phone,  DateTime? createdAt,  String? ownerId,  String? ownerName)?  $default,) {final _that = this;
switch (_that) {
case _Lead() when $default != null:
return $default(_that.id,_that.name,_that.company,_that.score,_that.status,_that.source,_that.email,_that.phone,_that.createdAt,_that.ownerId,_that.ownerName);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Lead implements Lead {
  const _Lead({required this.id, required this.name, this.company, this.score, required this.status, this.source, this.email, this.phone, this.createdAt, this.ownerId, this.ownerName});
  factory _Lead.fromJson(Map<String, dynamic> json) => _$LeadFromJson(json);

@override final  String id;
@override final  String name;
@override final  String? company;
@override final  int? score;
@override final  LeadStatus status;
@override final  String? source;
@override final  String? email;
@override final  String? phone;
@override final  DateTime? createdAt;
@override final  String? ownerId;
@override final  String? ownerName;

/// Create a copy of Lead
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$LeadCopyWith<_Lead> get copyWith => __$LeadCopyWithImpl<_Lead>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$LeadToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Lead&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.company, company) || other.company == company)&&(identical(other.score, score) || other.score == score)&&(identical(other.status, status) || other.status == status)&&(identical(other.source, source) || other.source == source)&&(identical(other.email, email) || other.email == email)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.ownerId, ownerId) || other.ownerId == ownerId)&&(identical(other.ownerName, ownerName) || other.ownerName == ownerName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,company,score,status,source,email,phone,createdAt,ownerId,ownerName);

@override
String toString() {
  return 'Lead(id: $id, name: $name, company: $company, score: $score, status: $status, source: $source, email: $email, phone: $phone, createdAt: $createdAt, ownerId: $ownerId, ownerName: $ownerName)';
}


}

/// @nodoc
abstract mixin class _$LeadCopyWith<$Res> implements $LeadCopyWith<$Res> {
  factory _$LeadCopyWith(_Lead value, $Res Function(_Lead) _then) = __$LeadCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String? company, int? score, LeadStatus status, String? source, String? email, String? phone, DateTime? createdAt, String? ownerId, String? ownerName
});




}
/// @nodoc
class __$LeadCopyWithImpl<$Res>
    implements _$LeadCopyWith<$Res> {
  __$LeadCopyWithImpl(this._self, this._then);

  final _Lead _self;
  final $Res Function(_Lead) _then;

/// Create a copy of Lead
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? company = freezed,Object? score = freezed,Object? status = null,Object? source = freezed,Object? email = freezed,Object? phone = freezed,Object? createdAt = freezed,Object? ownerId = freezed,Object? ownerName = freezed,}) {
  return _then(_Lead(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,company: freezed == company ? _self.company : company // ignore: cast_nullable_to_non_nullable
as String?,score: freezed == score ? _self.score : score // ignore: cast_nullable_to_non_nullable
as int?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as LeadStatus,source: freezed == source ? _self.source : source // ignore: cast_nullable_to_non_nullable
as String?,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,phone: freezed == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,ownerId: freezed == ownerId ? _self.ownerId : ownerId // ignore: cast_nullable_to_non_nullable
as String?,ownerName: freezed == ownerName ? _self.ownerName : ownerName // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$LeadFilters {

 LeadStatus? get status; String? get source; int? get minScore; String? get ownerId; String? get search;
/// Create a copy of LeadFilters
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$LeadFiltersCopyWith<LeadFilters> get copyWith => _$LeadFiltersCopyWithImpl<LeadFilters>(this as LeadFilters, _$identity);

  /// Serializes this LeadFilters to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is LeadFilters&&(identical(other.status, status) || other.status == status)&&(identical(other.source, source) || other.source == source)&&(identical(other.minScore, minScore) || other.minScore == minScore)&&(identical(other.ownerId, ownerId) || other.ownerId == ownerId)&&(identical(other.search, search) || other.search == search));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,status,source,minScore,ownerId,search);

@override
String toString() {
  return 'LeadFilters(status: $status, source: $source, minScore: $minScore, ownerId: $ownerId, search: $search)';
}


}

/// @nodoc
abstract mixin class $LeadFiltersCopyWith<$Res>  {
  factory $LeadFiltersCopyWith(LeadFilters value, $Res Function(LeadFilters) _then) = _$LeadFiltersCopyWithImpl;
@useResult
$Res call({
 LeadStatus? status, String? source, int? minScore, String? ownerId, String? search
});




}
/// @nodoc
class _$LeadFiltersCopyWithImpl<$Res>
    implements $LeadFiltersCopyWith<$Res> {
  _$LeadFiltersCopyWithImpl(this._self, this._then);

  final LeadFilters _self;
  final $Res Function(LeadFilters) _then;

/// Create a copy of LeadFilters
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? status = freezed,Object? source = freezed,Object? minScore = freezed,Object? ownerId = freezed,Object? search = freezed,}) {
  return _then(_self.copyWith(
status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as LeadStatus?,source: freezed == source ? _self.source : source // ignore: cast_nullable_to_non_nullable
as String?,minScore: freezed == minScore ? _self.minScore : minScore // ignore: cast_nullable_to_non_nullable
as int?,ownerId: freezed == ownerId ? _self.ownerId : ownerId // ignore: cast_nullable_to_non_nullable
as String?,search: freezed == search ? _self.search : search // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [LeadFilters].
extension LeadFiltersPatterns on LeadFilters {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _LeadFilters value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _LeadFilters() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _LeadFilters value)  $default,){
final _that = this;
switch (_that) {
case _LeadFilters():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _LeadFilters value)?  $default,){
final _that = this;
switch (_that) {
case _LeadFilters() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( LeadStatus? status,  String? source,  int? minScore,  String? ownerId,  String? search)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _LeadFilters() when $default != null:
return $default(_that.status,_that.source,_that.minScore,_that.ownerId,_that.search);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( LeadStatus? status,  String? source,  int? minScore,  String? ownerId,  String? search)  $default,) {final _that = this;
switch (_that) {
case _LeadFilters():
return $default(_that.status,_that.source,_that.minScore,_that.ownerId,_that.search);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( LeadStatus? status,  String? source,  int? minScore,  String? ownerId,  String? search)?  $default,) {final _that = this;
switch (_that) {
case _LeadFilters() when $default != null:
return $default(_that.status,_that.source,_that.minScore,_that.ownerId,_that.search);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _LeadFilters implements LeadFilters {
  const _LeadFilters({this.status, this.source, this.minScore, this.ownerId, this.search});
  factory _LeadFilters.fromJson(Map<String, dynamic> json) => _$LeadFiltersFromJson(json);

@override final  LeadStatus? status;
@override final  String? source;
@override final  int? minScore;
@override final  String? ownerId;
@override final  String? search;

/// Create a copy of LeadFilters
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$LeadFiltersCopyWith<_LeadFilters> get copyWith => __$LeadFiltersCopyWithImpl<_LeadFilters>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$LeadFiltersToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _LeadFilters&&(identical(other.status, status) || other.status == status)&&(identical(other.source, source) || other.source == source)&&(identical(other.minScore, minScore) || other.minScore == minScore)&&(identical(other.ownerId, ownerId) || other.ownerId == ownerId)&&(identical(other.search, search) || other.search == search));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,status,source,minScore,ownerId,search);

@override
String toString() {
  return 'LeadFilters(status: $status, source: $source, minScore: $minScore, ownerId: $ownerId, search: $search)';
}


}

/// @nodoc
abstract mixin class _$LeadFiltersCopyWith<$Res> implements $LeadFiltersCopyWith<$Res> {
  factory _$LeadFiltersCopyWith(_LeadFilters value, $Res Function(_LeadFilters) _then) = __$LeadFiltersCopyWithImpl;
@override @useResult
$Res call({
 LeadStatus? status, String? source, int? minScore, String? ownerId, String? search
});




}
/// @nodoc
class __$LeadFiltersCopyWithImpl<$Res>
    implements _$LeadFiltersCopyWith<$Res> {
  __$LeadFiltersCopyWithImpl(this._self, this._then);

  final _LeadFilters _self;
  final $Res Function(_LeadFilters) _then;

/// Create a copy of LeadFilters
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? status = freezed,Object? source = freezed,Object? minScore = freezed,Object? ownerId = freezed,Object? search = freezed,}) {
  return _then(_LeadFilters(
status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as LeadStatus?,source: freezed == source ? _self.source : source // ignore: cast_nullable_to_non_nullable
as String?,minScore: freezed == minScore ? _self.minScore : minScore // ignore: cast_nullable_to_non_nullable
as int?,ownerId: freezed == ownerId ? _self.ownerId : ownerId // ignore: cast_nullable_to_non_nullable
as String?,search: freezed == search ? _self.search : search // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$ForecastData {

 String get period; double get quota; double get commit; double get bestCase; double get closed; List<RepForecast> get byRep; List<PipelineStage> get pipeline;
/// Create a copy of ForecastData
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ForecastDataCopyWith<ForecastData> get copyWith => _$ForecastDataCopyWithImpl<ForecastData>(this as ForecastData, _$identity);

  /// Serializes this ForecastData to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ForecastData&&(identical(other.period, period) || other.period == period)&&(identical(other.quota, quota) || other.quota == quota)&&(identical(other.commit, commit) || other.commit == commit)&&(identical(other.bestCase, bestCase) || other.bestCase == bestCase)&&(identical(other.closed, closed) || other.closed == closed)&&const DeepCollectionEquality().equals(other.byRep, byRep)&&const DeepCollectionEquality().equals(other.pipeline, pipeline));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,period,quota,commit,bestCase,closed,const DeepCollectionEquality().hash(byRep),const DeepCollectionEquality().hash(pipeline));

@override
String toString() {
  return 'ForecastData(period: $period, quota: $quota, commit: $commit, bestCase: $bestCase, closed: $closed, byRep: $byRep, pipeline: $pipeline)';
}


}

/// @nodoc
abstract mixin class $ForecastDataCopyWith<$Res>  {
  factory $ForecastDataCopyWith(ForecastData value, $Res Function(ForecastData) _then) = _$ForecastDataCopyWithImpl;
@useResult
$Res call({
 String period, double quota, double commit, double bestCase, double closed, List<RepForecast> byRep, List<PipelineStage> pipeline
});




}
/// @nodoc
class _$ForecastDataCopyWithImpl<$Res>
    implements $ForecastDataCopyWith<$Res> {
  _$ForecastDataCopyWithImpl(this._self, this._then);

  final ForecastData _self;
  final $Res Function(ForecastData) _then;

/// Create a copy of ForecastData
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? period = null,Object? quota = null,Object? commit = null,Object? bestCase = null,Object? closed = null,Object? byRep = null,Object? pipeline = null,}) {
  return _then(_self.copyWith(
period: null == period ? _self.period : period // ignore: cast_nullable_to_non_nullable
as String,quota: null == quota ? _self.quota : quota // ignore: cast_nullable_to_non_nullable
as double,commit: null == commit ? _self.commit : commit // ignore: cast_nullable_to_non_nullable
as double,bestCase: null == bestCase ? _self.bestCase : bestCase // ignore: cast_nullable_to_non_nullable
as double,closed: null == closed ? _self.closed : closed // ignore: cast_nullable_to_non_nullable
as double,byRep: null == byRep ? _self.byRep : byRep // ignore: cast_nullable_to_non_nullable
as List<RepForecast>,pipeline: null == pipeline ? _self.pipeline : pipeline // ignore: cast_nullable_to_non_nullable
as List<PipelineStage>,
  ));
}

}


/// Adds pattern-matching-related methods to [ForecastData].
extension ForecastDataPatterns on ForecastData {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ForecastData value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ForecastData() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ForecastData value)  $default,){
final _that = this;
switch (_that) {
case _ForecastData():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ForecastData value)?  $default,){
final _that = this;
switch (_that) {
case _ForecastData() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String period,  double quota,  double commit,  double bestCase,  double closed,  List<RepForecast> byRep,  List<PipelineStage> pipeline)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ForecastData() when $default != null:
return $default(_that.period,_that.quota,_that.commit,_that.bestCase,_that.closed,_that.byRep,_that.pipeline);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String period,  double quota,  double commit,  double bestCase,  double closed,  List<RepForecast> byRep,  List<PipelineStage> pipeline)  $default,) {final _that = this;
switch (_that) {
case _ForecastData():
return $default(_that.period,_that.quota,_that.commit,_that.bestCase,_that.closed,_that.byRep,_that.pipeline);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String period,  double quota,  double commit,  double bestCase,  double closed,  List<RepForecast> byRep,  List<PipelineStage> pipeline)?  $default,) {final _that = this;
switch (_that) {
case _ForecastData() when $default != null:
return $default(_that.period,_that.quota,_that.commit,_that.bestCase,_that.closed,_that.byRep,_that.pipeline);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ForecastData implements ForecastData {
  const _ForecastData({required this.period, required this.quota, required this.commit, required this.bestCase, required this.closed, final  List<RepForecast> byRep = const [], final  List<PipelineStage> pipeline = const []}): _byRep = byRep,_pipeline = pipeline;
  factory _ForecastData.fromJson(Map<String, dynamic> json) => _$ForecastDataFromJson(json);

@override final  String period;
@override final  double quota;
@override final  double commit;
@override final  double bestCase;
@override final  double closed;
 final  List<RepForecast> _byRep;
@override@JsonKey() List<RepForecast> get byRep {
  if (_byRep is EqualUnmodifiableListView) return _byRep;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_byRep);
}

 final  List<PipelineStage> _pipeline;
@override@JsonKey() List<PipelineStage> get pipeline {
  if (_pipeline is EqualUnmodifiableListView) return _pipeline;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_pipeline);
}


/// Create a copy of ForecastData
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ForecastDataCopyWith<_ForecastData> get copyWith => __$ForecastDataCopyWithImpl<_ForecastData>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ForecastDataToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ForecastData&&(identical(other.period, period) || other.period == period)&&(identical(other.quota, quota) || other.quota == quota)&&(identical(other.commit, commit) || other.commit == commit)&&(identical(other.bestCase, bestCase) || other.bestCase == bestCase)&&(identical(other.closed, closed) || other.closed == closed)&&const DeepCollectionEquality().equals(other._byRep, _byRep)&&const DeepCollectionEquality().equals(other._pipeline, _pipeline));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,period,quota,commit,bestCase,closed,const DeepCollectionEquality().hash(_byRep),const DeepCollectionEquality().hash(_pipeline));

@override
String toString() {
  return 'ForecastData(period: $period, quota: $quota, commit: $commit, bestCase: $bestCase, closed: $closed, byRep: $byRep, pipeline: $pipeline)';
}


}

/// @nodoc
abstract mixin class _$ForecastDataCopyWith<$Res> implements $ForecastDataCopyWith<$Res> {
  factory _$ForecastDataCopyWith(_ForecastData value, $Res Function(_ForecastData) _then) = __$ForecastDataCopyWithImpl;
@override @useResult
$Res call({
 String period, double quota, double commit, double bestCase, double closed, List<RepForecast> byRep, List<PipelineStage> pipeline
});




}
/// @nodoc
class __$ForecastDataCopyWithImpl<$Res>
    implements _$ForecastDataCopyWith<$Res> {
  __$ForecastDataCopyWithImpl(this._self, this._then);

  final _ForecastData _self;
  final $Res Function(_ForecastData) _then;

/// Create a copy of ForecastData
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? period = null,Object? quota = null,Object? commit = null,Object? bestCase = null,Object? closed = null,Object? byRep = null,Object? pipeline = null,}) {
  return _then(_ForecastData(
period: null == period ? _self.period : period // ignore: cast_nullable_to_non_nullable
as String,quota: null == quota ? _self.quota : quota // ignore: cast_nullable_to_non_nullable
as double,commit: null == commit ? _self.commit : commit // ignore: cast_nullable_to_non_nullable
as double,bestCase: null == bestCase ? _self.bestCase : bestCase // ignore: cast_nullable_to_non_nullable
as double,closed: null == closed ? _self.closed : closed // ignore: cast_nullable_to_non_nullable
as double,byRep: null == byRep ? _self._byRep : byRep // ignore: cast_nullable_to_non_nullable
as List<RepForecast>,pipeline: null == pipeline ? _self._pipeline : pipeline // ignore: cast_nullable_to_non_nullable
as List<PipelineStage>,
  ));
}


}


/// @nodoc
mixin _$Period {

 String get label; DateTime get start; DateTime get end; String? get quarter; int? get year;
/// Create a copy of Period
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PeriodCopyWith<Period> get copyWith => _$PeriodCopyWithImpl<Period>(this as Period, _$identity);

  /// Serializes this Period to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Period&&(identical(other.label, label) || other.label == label)&&(identical(other.start, start) || other.start == start)&&(identical(other.end, end) || other.end == end)&&(identical(other.quarter, quarter) || other.quarter == quarter)&&(identical(other.year, year) || other.year == year));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,start,end,quarter,year);

@override
String toString() {
  return 'Period(label: $label, start: $start, end: $end, quarter: $quarter, year: $year)';
}


}

/// @nodoc
abstract mixin class $PeriodCopyWith<$Res>  {
  factory $PeriodCopyWith(Period value, $Res Function(Period) _then) = _$PeriodCopyWithImpl;
@useResult
$Res call({
 String label, DateTime start, DateTime end, String? quarter, int? year
});




}
/// @nodoc
class _$PeriodCopyWithImpl<$Res>
    implements $PeriodCopyWith<$Res> {
  _$PeriodCopyWithImpl(this._self, this._then);

  final Period _self;
  final $Res Function(Period) _then;

/// Create a copy of Period
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? label = null,Object? start = null,Object? end = null,Object? quarter = freezed,Object? year = freezed,}) {
  return _then(_self.copyWith(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,start: null == start ? _self.start : start // ignore: cast_nullable_to_non_nullable
as DateTime,end: null == end ? _self.end : end // ignore: cast_nullable_to_non_nullable
as DateTime,quarter: freezed == quarter ? _self.quarter : quarter // ignore: cast_nullable_to_non_nullable
as String?,year: freezed == year ? _self.year : year // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}

}


/// Adds pattern-matching-related methods to [Period].
extension PeriodPatterns on Period {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Period value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Period() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Period value)  $default,){
final _that = this;
switch (_that) {
case _Period():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Period value)?  $default,){
final _that = this;
switch (_that) {
case _Period() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String label,  DateTime start,  DateTime end,  String? quarter,  int? year)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Period() when $default != null:
return $default(_that.label,_that.start,_that.end,_that.quarter,_that.year);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String label,  DateTime start,  DateTime end,  String? quarter,  int? year)  $default,) {final _that = this;
switch (_that) {
case _Period():
return $default(_that.label,_that.start,_that.end,_that.quarter,_that.year);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String label,  DateTime start,  DateTime end,  String? quarter,  int? year)?  $default,) {final _that = this;
switch (_that) {
case _Period() when $default != null:
return $default(_that.label,_that.start,_that.end,_that.quarter,_that.year);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Period implements Period {
  const _Period({required this.label, required this.start, required this.end, this.quarter, this.year});
  factory _Period.fromJson(Map<String, dynamic> json) => _$PeriodFromJson(json);

@override final  String label;
@override final  DateTime start;
@override final  DateTime end;
@override final  String? quarter;
@override final  int? year;

/// Create a copy of Period
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PeriodCopyWith<_Period> get copyWith => __$PeriodCopyWithImpl<_Period>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PeriodToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Period&&(identical(other.label, label) || other.label == label)&&(identical(other.start, start) || other.start == start)&&(identical(other.end, end) || other.end == end)&&(identical(other.quarter, quarter) || other.quarter == quarter)&&(identical(other.year, year) || other.year == year));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,start,end,quarter,year);

@override
String toString() {
  return 'Period(label: $label, start: $start, end: $end, quarter: $quarter, year: $year)';
}


}

/// @nodoc
abstract mixin class _$PeriodCopyWith<$Res> implements $PeriodCopyWith<$Res> {
  factory _$PeriodCopyWith(_Period value, $Res Function(_Period) _then) = __$PeriodCopyWithImpl;
@override @useResult
$Res call({
 String label, DateTime start, DateTime end, String? quarter, int? year
});




}
/// @nodoc
class __$PeriodCopyWithImpl<$Res>
    implements _$PeriodCopyWith<$Res> {
  __$PeriodCopyWithImpl(this._self, this._then);

  final _Period _self;
  final $Res Function(_Period) _then;

/// Create a copy of Period
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? label = null,Object? start = null,Object? end = null,Object? quarter = freezed,Object? year = freezed,}) {
  return _then(_Period(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,start: null == start ? _self.start : start // ignore: cast_nullable_to_non_nullable
as DateTime,end: null == end ? _self.end : end // ignore: cast_nullable_to_non_nullable
as DateTime,quarter: freezed == quarter ? _self.quarter : quarter // ignore: cast_nullable_to_non_nullable
as String?,year: freezed == year ? _self.year : year // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}


}


/// @nodoc
mixin _$RepForecast {

 String get repId; String get repName; double get quota; double get closed; double get commit; double? get percentToQuota;
/// Create a copy of RepForecast
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RepForecastCopyWith<RepForecast> get copyWith => _$RepForecastCopyWithImpl<RepForecast>(this as RepForecast, _$identity);

  /// Serializes this RepForecast to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RepForecast&&(identical(other.repId, repId) || other.repId == repId)&&(identical(other.repName, repName) || other.repName == repName)&&(identical(other.quota, quota) || other.quota == quota)&&(identical(other.closed, closed) || other.closed == closed)&&(identical(other.commit, commit) || other.commit == commit)&&(identical(other.percentToQuota, percentToQuota) || other.percentToQuota == percentToQuota));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,repId,repName,quota,closed,commit,percentToQuota);

@override
String toString() {
  return 'RepForecast(repId: $repId, repName: $repName, quota: $quota, closed: $closed, commit: $commit, percentToQuota: $percentToQuota)';
}


}

/// @nodoc
abstract mixin class $RepForecastCopyWith<$Res>  {
  factory $RepForecastCopyWith(RepForecast value, $Res Function(RepForecast) _then) = _$RepForecastCopyWithImpl;
@useResult
$Res call({
 String repId, String repName, double quota, double closed, double commit, double? percentToQuota
});




}
/// @nodoc
class _$RepForecastCopyWithImpl<$Res>
    implements $RepForecastCopyWith<$Res> {
  _$RepForecastCopyWithImpl(this._self, this._then);

  final RepForecast _self;
  final $Res Function(RepForecast) _then;

/// Create a copy of RepForecast
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? repId = null,Object? repName = null,Object? quota = null,Object? closed = null,Object? commit = null,Object? percentToQuota = freezed,}) {
  return _then(_self.copyWith(
repId: null == repId ? _self.repId : repId // ignore: cast_nullable_to_non_nullable
as String,repName: null == repName ? _self.repName : repName // ignore: cast_nullable_to_non_nullable
as String,quota: null == quota ? _self.quota : quota // ignore: cast_nullable_to_non_nullable
as double,closed: null == closed ? _self.closed : closed // ignore: cast_nullable_to_non_nullable
as double,commit: null == commit ? _self.commit : commit // ignore: cast_nullable_to_non_nullable
as double,percentToQuota: freezed == percentToQuota ? _self.percentToQuota : percentToQuota // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [RepForecast].
extension RepForecastPatterns on RepForecast {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RepForecast value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RepForecast() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RepForecast value)  $default,){
final _that = this;
switch (_that) {
case _RepForecast():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RepForecast value)?  $default,){
final _that = this;
switch (_that) {
case _RepForecast() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String repId,  String repName,  double quota,  double closed,  double commit,  double? percentToQuota)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RepForecast() when $default != null:
return $default(_that.repId,_that.repName,_that.quota,_that.closed,_that.commit,_that.percentToQuota);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String repId,  String repName,  double quota,  double closed,  double commit,  double? percentToQuota)  $default,) {final _that = this;
switch (_that) {
case _RepForecast():
return $default(_that.repId,_that.repName,_that.quota,_that.closed,_that.commit,_that.percentToQuota);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String repId,  String repName,  double quota,  double closed,  double commit,  double? percentToQuota)?  $default,) {final _that = this;
switch (_that) {
case _RepForecast() when $default != null:
return $default(_that.repId,_that.repName,_that.quota,_that.closed,_that.commit,_that.percentToQuota);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RepForecast implements RepForecast {
  const _RepForecast({required this.repId, required this.repName, required this.quota, required this.closed, required this.commit, this.percentToQuota});
  factory _RepForecast.fromJson(Map<String, dynamic> json) => _$RepForecastFromJson(json);

@override final  String repId;
@override final  String repName;
@override final  double quota;
@override final  double closed;
@override final  double commit;
@override final  double? percentToQuota;

/// Create a copy of RepForecast
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RepForecastCopyWith<_RepForecast> get copyWith => __$RepForecastCopyWithImpl<_RepForecast>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RepForecastToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RepForecast&&(identical(other.repId, repId) || other.repId == repId)&&(identical(other.repName, repName) || other.repName == repName)&&(identical(other.quota, quota) || other.quota == quota)&&(identical(other.closed, closed) || other.closed == closed)&&(identical(other.commit, commit) || other.commit == commit)&&(identical(other.percentToQuota, percentToQuota) || other.percentToQuota == percentToQuota));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,repId,repName,quota,closed,commit,percentToQuota);

@override
String toString() {
  return 'RepForecast(repId: $repId, repName: $repName, quota: $quota, closed: $closed, commit: $commit, percentToQuota: $percentToQuota)';
}


}

/// @nodoc
abstract mixin class _$RepForecastCopyWith<$Res> implements $RepForecastCopyWith<$Res> {
  factory _$RepForecastCopyWith(_RepForecast value, $Res Function(_RepForecast) _then) = __$RepForecastCopyWithImpl;
@override @useResult
$Res call({
 String repId, String repName, double quota, double closed, double commit, double? percentToQuota
});




}
/// @nodoc
class __$RepForecastCopyWithImpl<$Res>
    implements _$RepForecastCopyWith<$Res> {
  __$RepForecastCopyWithImpl(this._self, this._then);

  final _RepForecast _self;
  final $Res Function(_RepForecast) _then;

/// Create a copy of RepForecast
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? repId = null,Object? repName = null,Object? quota = null,Object? closed = null,Object? commit = null,Object? percentToQuota = freezed,}) {
  return _then(_RepForecast(
repId: null == repId ? _self.repId : repId // ignore: cast_nullable_to_non_nullable
as String,repName: null == repName ? _self.repName : repName // ignore: cast_nullable_to_non_nullable
as String,quota: null == quota ? _self.quota : quota // ignore: cast_nullable_to_non_nullable
as double,closed: null == closed ? _self.closed : closed // ignore: cast_nullable_to_non_nullable
as double,commit: null == commit ? _self.commit : commit // ignore: cast_nullable_to_non_nullable
as double,percentToQuota: freezed == percentToQuota ? _self.percentToQuota : percentToQuota // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$PipelineStage {

 String get stage; double get amount; int get dealCount; double? get probability; double? get weightedAmount;
/// Create a copy of PipelineStage
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PipelineStageCopyWith<PipelineStage> get copyWith => _$PipelineStageCopyWithImpl<PipelineStage>(this as PipelineStage, _$identity);

  /// Serializes this PipelineStage to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PipelineStage&&(identical(other.stage, stage) || other.stage == stage)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.dealCount, dealCount) || other.dealCount == dealCount)&&(identical(other.probability, probability) || other.probability == probability)&&(identical(other.weightedAmount, weightedAmount) || other.weightedAmount == weightedAmount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,stage,amount,dealCount,probability,weightedAmount);

@override
String toString() {
  return 'PipelineStage(stage: $stage, amount: $amount, dealCount: $dealCount, probability: $probability, weightedAmount: $weightedAmount)';
}


}

/// @nodoc
abstract mixin class $PipelineStageCopyWith<$Res>  {
  factory $PipelineStageCopyWith(PipelineStage value, $Res Function(PipelineStage) _then) = _$PipelineStageCopyWithImpl;
@useResult
$Res call({
 String stage, double amount, int dealCount, double? probability, double? weightedAmount
});




}
/// @nodoc
class _$PipelineStageCopyWithImpl<$Res>
    implements $PipelineStageCopyWith<$Res> {
  _$PipelineStageCopyWithImpl(this._self, this._then);

  final PipelineStage _self;
  final $Res Function(PipelineStage) _then;

/// Create a copy of PipelineStage
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? stage = null,Object? amount = null,Object? dealCount = null,Object? probability = freezed,Object? weightedAmount = freezed,}) {
  return _then(_self.copyWith(
stage: null == stage ? _self.stage : stage // ignore: cast_nullable_to_non_nullable
as String,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,dealCount: null == dealCount ? _self.dealCount : dealCount // ignore: cast_nullable_to_non_nullable
as int,probability: freezed == probability ? _self.probability : probability // ignore: cast_nullable_to_non_nullable
as double?,weightedAmount: freezed == weightedAmount ? _self.weightedAmount : weightedAmount // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [PipelineStage].
extension PipelineStagePatterns on PipelineStage {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PipelineStage value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PipelineStage() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PipelineStage value)  $default,){
final _that = this;
switch (_that) {
case _PipelineStage():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PipelineStage value)?  $default,){
final _that = this;
switch (_that) {
case _PipelineStage() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String stage,  double amount,  int dealCount,  double? probability,  double? weightedAmount)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PipelineStage() when $default != null:
return $default(_that.stage,_that.amount,_that.dealCount,_that.probability,_that.weightedAmount);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String stage,  double amount,  int dealCount,  double? probability,  double? weightedAmount)  $default,) {final _that = this;
switch (_that) {
case _PipelineStage():
return $default(_that.stage,_that.amount,_that.dealCount,_that.probability,_that.weightedAmount);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String stage,  double amount,  int dealCount,  double? probability,  double? weightedAmount)?  $default,) {final _that = this;
switch (_that) {
case _PipelineStage() when $default != null:
return $default(_that.stage,_that.amount,_that.dealCount,_that.probability,_that.weightedAmount);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PipelineStage implements PipelineStage {
  const _PipelineStage({required this.stage, required this.amount, required this.dealCount, this.probability, this.weightedAmount});
  factory _PipelineStage.fromJson(Map<String, dynamic> json) => _$PipelineStageFromJson(json);

@override final  String stage;
@override final  double amount;
@override final  int dealCount;
@override final  double? probability;
@override final  double? weightedAmount;

/// Create a copy of PipelineStage
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PipelineStageCopyWith<_PipelineStage> get copyWith => __$PipelineStageCopyWithImpl<_PipelineStage>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PipelineStageToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PipelineStage&&(identical(other.stage, stage) || other.stage == stage)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.dealCount, dealCount) || other.dealCount == dealCount)&&(identical(other.probability, probability) || other.probability == probability)&&(identical(other.weightedAmount, weightedAmount) || other.weightedAmount == weightedAmount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,stage,amount,dealCount,probability,weightedAmount);

@override
String toString() {
  return 'PipelineStage(stage: $stage, amount: $amount, dealCount: $dealCount, probability: $probability, weightedAmount: $weightedAmount)';
}


}

/// @nodoc
abstract mixin class _$PipelineStageCopyWith<$Res> implements $PipelineStageCopyWith<$Res> {
  factory _$PipelineStageCopyWith(_PipelineStage value, $Res Function(_PipelineStage) _then) = __$PipelineStageCopyWithImpl;
@override @useResult
$Res call({
 String stage, double amount, int dealCount, double? probability, double? weightedAmount
});




}
/// @nodoc
class __$PipelineStageCopyWithImpl<$Res>
    implements _$PipelineStageCopyWith<$Res> {
  __$PipelineStageCopyWithImpl(this._self, this._then);

  final _PipelineStage _self;
  final $Res Function(_PipelineStage) _then;

/// Create a copy of PipelineStage
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? stage = null,Object? amount = null,Object? dealCount = null,Object? probability = freezed,Object? weightedAmount = freezed,}) {
  return _then(_PipelineStage(
stage: null == stage ? _self.stage : stage // ignore: cast_nullable_to_non_nullable
as String,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,dealCount: null == dealCount ? _self.dealCount : dealCount // ignore: cast_nullable_to_non_nullable
as int,probability: freezed == probability ? _self.probability : probability // ignore: cast_nullable_to_non_nullable
as double?,weightedAmount: freezed == weightedAmount ? _self.weightedAmount : weightedAmount // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$PendingApprovals {

 List<TimeOffRequest> get timeOffRequests; List<ExpenseReport> get expenseReports; List<BudgetAmendment> get budgetAmendments; int? get totalCount; DateTime? get oldestSubmission;
/// Create a copy of PendingApprovals
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PendingApprovalsCopyWith<PendingApprovals> get copyWith => _$PendingApprovalsCopyWithImpl<PendingApprovals>(this as PendingApprovals, _$identity);

  /// Serializes this PendingApprovals to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PendingApprovals&&const DeepCollectionEquality().equals(other.timeOffRequests, timeOffRequests)&&const DeepCollectionEquality().equals(other.expenseReports, expenseReports)&&const DeepCollectionEquality().equals(other.budgetAmendments, budgetAmendments)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.oldestSubmission, oldestSubmission) || other.oldestSubmission == oldestSubmission));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(timeOffRequests),const DeepCollectionEquality().hash(expenseReports),const DeepCollectionEquality().hash(budgetAmendments),totalCount,oldestSubmission);

@override
String toString() {
  return 'PendingApprovals(timeOffRequests: $timeOffRequests, expenseReports: $expenseReports, budgetAmendments: $budgetAmendments, totalCount: $totalCount, oldestSubmission: $oldestSubmission)';
}


}

/// @nodoc
abstract mixin class $PendingApprovalsCopyWith<$Res>  {
  factory $PendingApprovalsCopyWith(PendingApprovals value, $Res Function(PendingApprovals) _then) = _$PendingApprovalsCopyWithImpl;
@useResult
$Res call({
 List<TimeOffRequest> timeOffRequests, List<ExpenseReport> expenseReports, List<BudgetAmendment> budgetAmendments, int? totalCount, DateTime? oldestSubmission
});




}
/// @nodoc
class _$PendingApprovalsCopyWithImpl<$Res>
    implements $PendingApprovalsCopyWith<$Res> {
  _$PendingApprovalsCopyWithImpl(this._self, this._then);

  final PendingApprovals _self;
  final $Res Function(PendingApprovals) _then;

/// Create a copy of PendingApprovals
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? timeOffRequests = null,Object? expenseReports = null,Object? budgetAmendments = null,Object? totalCount = freezed,Object? oldestSubmission = freezed,}) {
  return _then(_self.copyWith(
timeOffRequests: null == timeOffRequests ? _self.timeOffRequests : timeOffRequests // ignore: cast_nullable_to_non_nullable
as List<TimeOffRequest>,expenseReports: null == expenseReports ? _self.expenseReports : expenseReports // ignore: cast_nullable_to_non_nullable
as List<ExpenseReport>,budgetAmendments: null == budgetAmendments ? _self.budgetAmendments : budgetAmendments // ignore: cast_nullable_to_non_nullable
as List<BudgetAmendment>,totalCount: freezed == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int?,oldestSubmission: freezed == oldestSubmission ? _self.oldestSubmission : oldestSubmission // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [PendingApprovals].
extension PendingApprovalsPatterns on PendingApprovals {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PendingApprovals value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PendingApprovals() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PendingApprovals value)  $default,){
final _that = this;
switch (_that) {
case _PendingApprovals():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PendingApprovals value)?  $default,){
final _that = this;
switch (_that) {
case _PendingApprovals() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<TimeOffRequest> timeOffRequests,  List<ExpenseReport> expenseReports,  List<BudgetAmendment> budgetAmendments,  int? totalCount,  DateTime? oldestSubmission)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PendingApprovals() when $default != null:
return $default(_that.timeOffRequests,_that.expenseReports,_that.budgetAmendments,_that.totalCount,_that.oldestSubmission);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<TimeOffRequest> timeOffRequests,  List<ExpenseReport> expenseReports,  List<BudgetAmendment> budgetAmendments,  int? totalCount,  DateTime? oldestSubmission)  $default,) {final _that = this;
switch (_that) {
case _PendingApprovals():
return $default(_that.timeOffRequests,_that.expenseReports,_that.budgetAmendments,_that.totalCount,_that.oldestSubmission);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<TimeOffRequest> timeOffRequests,  List<ExpenseReport> expenseReports,  List<BudgetAmendment> budgetAmendments,  int? totalCount,  DateTime? oldestSubmission)?  $default,) {final _that = this;
switch (_that) {
case _PendingApprovals() when $default != null:
return $default(_that.timeOffRequests,_that.expenseReports,_that.budgetAmendments,_that.totalCount,_that.oldestSubmission);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PendingApprovals implements PendingApprovals {
  const _PendingApprovals({final  List<TimeOffRequest> timeOffRequests = const [], final  List<ExpenseReport> expenseReports = const [], final  List<BudgetAmendment> budgetAmendments = const [], this.totalCount, this.oldestSubmission}): _timeOffRequests = timeOffRequests,_expenseReports = expenseReports,_budgetAmendments = budgetAmendments;
  factory _PendingApprovals.fromJson(Map<String, dynamic> json) => _$PendingApprovalsFromJson(json);

 final  List<TimeOffRequest> _timeOffRequests;
@override@JsonKey() List<TimeOffRequest> get timeOffRequests {
  if (_timeOffRequests is EqualUnmodifiableListView) return _timeOffRequests;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_timeOffRequests);
}

 final  List<ExpenseReport> _expenseReports;
@override@JsonKey() List<ExpenseReport> get expenseReports {
  if (_expenseReports is EqualUnmodifiableListView) return _expenseReports;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_expenseReports);
}

 final  List<BudgetAmendment> _budgetAmendments;
@override@JsonKey() List<BudgetAmendment> get budgetAmendments {
  if (_budgetAmendments is EqualUnmodifiableListView) return _budgetAmendments;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_budgetAmendments);
}

@override final  int? totalCount;
@override final  DateTime? oldestSubmission;

/// Create a copy of PendingApprovals
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PendingApprovalsCopyWith<_PendingApprovals> get copyWith => __$PendingApprovalsCopyWithImpl<_PendingApprovals>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PendingApprovalsToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PendingApprovals&&const DeepCollectionEquality().equals(other._timeOffRequests, _timeOffRequests)&&const DeepCollectionEquality().equals(other._expenseReports, _expenseReports)&&const DeepCollectionEquality().equals(other._budgetAmendments, _budgetAmendments)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.oldestSubmission, oldestSubmission) || other.oldestSubmission == oldestSubmission));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_timeOffRequests),const DeepCollectionEquality().hash(_expenseReports),const DeepCollectionEquality().hash(_budgetAmendments),totalCount,oldestSubmission);

@override
String toString() {
  return 'PendingApprovals(timeOffRequests: $timeOffRequests, expenseReports: $expenseReports, budgetAmendments: $budgetAmendments, totalCount: $totalCount, oldestSubmission: $oldestSubmission)';
}


}

/// @nodoc
abstract mixin class _$PendingApprovalsCopyWith<$Res> implements $PendingApprovalsCopyWith<$Res> {
  factory _$PendingApprovalsCopyWith(_PendingApprovals value, $Res Function(_PendingApprovals) _then) = __$PendingApprovalsCopyWithImpl;
@override @useResult
$Res call({
 List<TimeOffRequest> timeOffRequests, List<ExpenseReport> expenseReports, List<BudgetAmendment> budgetAmendments, int? totalCount, DateTime? oldestSubmission
});




}
/// @nodoc
class __$PendingApprovalsCopyWithImpl<$Res>
    implements _$PendingApprovalsCopyWith<$Res> {
  __$PendingApprovalsCopyWithImpl(this._self, this._then);

  final _PendingApprovals _self;
  final $Res Function(_PendingApprovals) _then;

/// Create a copy of PendingApprovals
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? timeOffRequests = null,Object? expenseReports = null,Object? budgetAmendments = null,Object? totalCount = freezed,Object? oldestSubmission = freezed,}) {
  return _then(_PendingApprovals(
timeOffRequests: null == timeOffRequests ? _self._timeOffRequests : timeOffRequests // ignore: cast_nullable_to_non_nullable
as List<TimeOffRequest>,expenseReports: null == expenseReports ? _self._expenseReports : expenseReports // ignore: cast_nullable_to_non_nullable
as List<ExpenseReport>,budgetAmendments: null == budgetAmendments ? _self._budgetAmendments : budgetAmendments // ignore: cast_nullable_to_non_nullable
as List<BudgetAmendment>,totalCount: freezed == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int?,oldestSubmission: freezed == oldestSubmission ? _self.oldestSubmission : oldestSubmission // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}


/// @nodoc
mixin _$PaginationState {

 String? get cursor; bool get hasMore; int? get totalCount; int get currentPage; int get pageSize;
/// Create a copy of PaginationState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PaginationStateCopyWith<PaginationState> get copyWith => _$PaginationStateCopyWithImpl<PaginationState>(this as PaginationState, _$identity);

  /// Serializes this PaginationState to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PaginationState&&(identical(other.cursor, cursor) || other.cursor == cursor)&&(identical(other.hasMore, hasMore) || other.hasMore == hasMore)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.currentPage, currentPage) || other.currentPage == currentPage)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,cursor,hasMore,totalCount,currentPage,pageSize);

@override
String toString() {
  return 'PaginationState(cursor: $cursor, hasMore: $hasMore, totalCount: $totalCount, currentPage: $currentPage, pageSize: $pageSize)';
}


}

/// @nodoc
abstract mixin class $PaginationStateCopyWith<$Res>  {
  factory $PaginationStateCopyWith(PaginationState value, $Res Function(PaginationState) _then) = _$PaginationStateCopyWithImpl;
@useResult
$Res call({
 String? cursor, bool hasMore, int? totalCount, int currentPage, int pageSize
});




}
/// @nodoc
class _$PaginationStateCopyWithImpl<$Res>
    implements $PaginationStateCopyWith<$Res> {
  _$PaginationStateCopyWithImpl(this._self, this._then);

  final PaginationState _self;
  final $Res Function(PaginationState) _then;

/// Create a copy of PaginationState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? cursor = freezed,Object? hasMore = null,Object? totalCount = freezed,Object? currentPage = null,Object? pageSize = null,}) {
  return _then(_self.copyWith(
cursor: freezed == cursor ? _self.cursor : cursor // ignore: cast_nullable_to_non_nullable
as String?,hasMore: null == hasMore ? _self.hasMore : hasMore // ignore: cast_nullable_to_non_nullable
as bool,totalCount: freezed == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int?,currentPage: null == currentPage ? _self.currentPage : currentPage // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [PaginationState].
extension PaginationStatePatterns on PaginationState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PaginationState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PaginationState() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PaginationState value)  $default,){
final _that = this;
switch (_that) {
case _PaginationState():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PaginationState value)?  $default,){
final _that = this;
switch (_that) {
case _PaginationState() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? cursor,  bool hasMore,  int? totalCount,  int currentPage,  int pageSize)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PaginationState() when $default != null:
return $default(_that.cursor,_that.hasMore,_that.totalCount,_that.currentPage,_that.pageSize);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? cursor,  bool hasMore,  int? totalCount,  int currentPage,  int pageSize)  $default,) {final _that = this;
switch (_that) {
case _PaginationState():
return $default(_that.cursor,_that.hasMore,_that.totalCount,_that.currentPage,_that.pageSize);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? cursor,  bool hasMore,  int? totalCount,  int currentPage,  int pageSize)?  $default,) {final _that = this;
switch (_that) {
case _PaginationState() when $default != null:
return $default(_that.cursor,_that.hasMore,_that.totalCount,_that.currentPage,_that.pageSize);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PaginationState implements PaginationState {
  const _PaginationState({this.cursor, this.hasMore = false, this.totalCount, this.currentPage = 1, this.pageSize = 20});
  factory _PaginationState.fromJson(Map<String, dynamic> json) => _$PaginationStateFromJson(json);

@override final  String? cursor;
@override@JsonKey() final  bool hasMore;
@override final  int? totalCount;
@override@JsonKey() final  int currentPage;
@override@JsonKey() final  int pageSize;

/// Create a copy of PaginationState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PaginationStateCopyWith<_PaginationState> get copyWith => __$PaginationStateCopyWithImpl<_PaginationState>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PaginationStateToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PaginationState&&(identical(other.cursor, cursor) || other.cursor == cursor)&&(identical(other.hasMore, hasMore) || other.hasMore == hasMore)&&(identical(other.totalCount, totalCount) || other.totalCount == totalCount)&&(identical(other.currentPage, currentPage) || other.currentPage == currentPage)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,cursor,hasMore,totalCount,currentPage,pageSize);

@override
String toString() {
  return 'PaginationState(cursor: $cursor, hasMore: $hasMore, totalCount: $totalCount, currentPage: $currentPage, pageSize: $pageSize)';
}


}

/// @nodoc
abstract mixin class _$PaginationStateCopyWith<$Res> implements $PaginationStateCopyWith<$Res> {
  factory _$PaginationStateCopyWith(_PaginationState value, $Res Function(_PaginationState) _then) = __$PaginationStateCopyWithImpl;
@override @useResult
$Res call({
 String? cursor, bool hasMore, int? totalCount, int currentPage, int pageSize
});




}
/// @nodoc
class __$PaginationStateCopyWithImpl<$Res>
    implements _$PaginationStateCopyWith<$Res> {
  __$PaginationStateCopyWithImpl(this._self, this._then);

  final _PaginationState _self;
  final $Res Function(_PaginationState) _then;

/// Create a copy of PaginationState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? cursor = freezed,Object? hasMore = null,Object? totalCount = freezed,Object? currentPage = null,Object? pageSize = null,}) {
  return _then(_PaginationState(
cursor: freezed == cursor ? _self.cursor : cursor // ignore: cast_nullable_to_non_nullable
as String?,hasMore: null == hasMore ? _self.hasMore : hasMore // ignore: cast_nullable_to_non_nullable
as bool,totalCount: freezed == totalCount ? _self.totalCount : totalCount // ignore: cast_nullable_to_non_nullable
as int?,currentPage: null == currentPage ? _self.currentPage : currentPage // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$ActionEvent {

/// Action identifier
 String get actionId;/// Action type (e.g., 'navigate', 'approve', 'reject')
 String get actionType;/// ID of the item being acted upon
 String? get targetId;/// Additional data for the action
 Map<String, dynamic>? get payload;
/// Create a copy of ActionEvent
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ActionEventCopyWith<ActionEvent> get copyWith => _$ActionEventCopyWithImpl<ActionEvent>(this as ActionEvent, _$identity);

  /// Serializes this ActionEvent to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ActionEvent&&(identical(other.actionId, actionId) || other.actionId == actionId)&&(identical(other.actionType, actionType) || other.actionType == actionType)&&(identical(other.targetId, targetId) || other.targetId == targetId)&&const DeepCollectionEquality().equals(other.payload, payload));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,actionId,actionType,targetId,const DeepCollectionEquality().hash(payload));

@override
String toString() {
  return 'ActionEvent(actionId: $actionId, actionType: $actionType, targetId: $targetId, payload: $payload)';
}


}

/// @nodoc
abstract mixin class $ActionEventCopyWith<$Res>  {
  factory $ActionEventCopyWith(ActionEvent value, $Res Function(ActionEvent) _then) = _$ActionEventCopyWithImpl;
@useResult
$Res call({
 String actionId, String actionType, String? targetId, Map<String, dynamic>? payload
});




}
/// @nodoc
class _$ActionEventCopyWithImpl<$Res>
    implements $ActionEventCopyWith<$Res> {
  _$ActionEventCopyWithImpl(this._self, this._then);

  final ActionEvent _self;
  final $Res Function(ActionEvent) _then;

/// Create a copy of ActionEvent
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? actionId = null,Object? actionType = null,Object? targetId = freezed,Object? payload = freezed,}) {
  return _then(_self.copyWith(
actionId: null == actionId ? _self.actionId : actionId // ignore: cast_nullable_to_non_nullable
as String,actionType: null == actionType ? _self.actionType : actionType // ignore: cast_nullable_to_non_nullable
as String,targetId: freezed == targetId ? _self.targetId : targetId // ignore: cast_nullable_to_non_nullable
as String?,payload: freezed == payload ? _self.payload : payload // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}

}


/// Adds pattern-matching-related methods to [ActionEvent].
extension ActionEventPatterns on ActionEvent {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ActionEvent value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ActionEvent() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ActionEvent value)  $default,){
final _that = this;
switch (_that) {
case _ActionEvent():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ActionEvent value)?  $default,){
final _that = this;
switch (_that) {
case _ActionEvent() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String actionId,  String actionType,  String? targetId,  Map<String, dynamic>? payload)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ActionEvent() when $default != null:
return $default(_that.actionId,_that.actionType,_that.targetId,_that.payload);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String actionId,  String actionType,  String? targetId,  Map<String, dynamic>? payload)  $default,) {final _that = this;
switch (_that) {
case _ActionEvent():
return $default(_that.actionId,_that.actionType,_that.targetId,_that.payload);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String actionId,  String actionType,  String? targetId,  Map<String, dynamic>? payload)?  $default,) {final _that = this;
switch (_that) {
case _ActionEvent() when $default != null:
return $default(_that.actionId,_that.actionType,_that.targetId,_that.payload);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ActionEvent implements ActionEvent {
  const _ActionEvent({required this.actionId, required this.actionType, this.targetId, final  Map<String, dynamic>? payload}): _payload = payload;
  factory _ActionEvent.fromJson(Map<String, dynamic> json) => _$ActionEventFromJson(json);

/// Action identifier
@override final  String actionId;
/// Action type (e.g., 'navigate', 'approve', 'reject')
@override final  String actionType;
/// ID of the item being acted upon
@override final  String? targetId;
/// Additional data for the action
 final  Map<String, dynamic>? _payload;
/// Additional data for the action
@override Map<String, dynamic>? get payload {
  final value = _payload;
  if (value == null) return null;
  if (_payload is EqualUnmodifiableMapView) return _payload;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}


/// Create a copy of ActionEvent
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ActionEventCopyWith<_ActionEvent> get copyWith => __$ActionEventCopyWithImpl<_ActionEvent>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ActionEventToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ActionEvent&&(identical(other.actionId, actionId) || other.actionId == actionId)&&(identical(other.actionType, actionType) || other.actionType == actionType)&&(identical(other.targetId, targetId) || other.targetId == targetId)&&const DeepCollectionEquality().equals(other._payload, _payload));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,actionId,actionType,targetId,const DeepCollectionEquality().hash(_payload));

@override
String toString() {
  return 'ActionEvent(actionId: $actionId, actionType: $actionType, targetId: $targetId, payload: $payload)';
}


}

/// @nodoc
abstract mixin class _$ActionEventCopyWith<$Res> implements $ActionEventCopyWith<$Res> {
  factory _$ActionEventCopyWith(_ActionEvent value, $Res Function(_ActionEvent) _then) = __$ActionEventCopyWithImpl;
@override @useResult
$Res call({
 String actionId, String actionType, String? targetId, Map<String, dynamic>? payload
});




}
/// @nodoc
class __$ActionEventCopyWithImpl<$Res>
    implements _$ActionEventCopyWith<$Res> {
  __$ActionEventCopyWithImpl(this._self, this._then);

  final _ActionEvent _self;
  final $Res Function(_ActionEvent) _then;

/// Create a copy of ActionEvent
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? actionId = null,Object? actionType = null,Object? targetId = freezed,Object? payload = freezed,}) {
  return _then(_ActionEvent(
actionId: null == actionId ? _self.actionId : actionId // ignore: cast_nullable_to_non_nullable
as String,actionType: null == actionType ? _self.actionType : actionType // ignore: cast_nullable_to_non_nullable
as String,targetId: freezed == targetId ? _self.targetId : targetId // ignore: cast_nullable_to_non_nullable
as String?,payload: freezed == payload ? _self._payload : payload // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}


}

// dart format on
