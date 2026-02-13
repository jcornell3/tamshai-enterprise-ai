// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'employee.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Employee _$EmployeeFromJson(Map<String, dynamic> json) => _Employee(
  id: json['id'] as String,
  name: json['name'] as String,
  title: json['title'] as String,
  email: json['email'] as String?,
  department: json['department'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  managerId: json['managerId'] as String?,
);

Map<String, dynamic> _$EmployeeToJson(_Employee instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'title': instance.title,
  'email': instance.email,
  'department': instance.department,
  'avatarUrl': instance.avatarUrl,
  'managerId': instance.managerId,
};
