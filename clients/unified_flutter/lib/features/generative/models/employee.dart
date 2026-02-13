import 'package:freezed_annotation/freezed_annotation.dart';

part 'employee.freezed.dart';
part 'employee.g.dart';

/// Employee model for org chart component
@freezed
sealed class Employee with _$Employee {
  const factory Employee({
    required String id,
    required String name,
    required String title,
    String? email,
    String? department,
    String? avatarUrl,
    String? managerId,
  }) = _Employee;

  factory Employee.fromJson(Map<String, dynamic> json) =>
      _$EmployeeFromJson(json);
}

/// Extension for Employee utilities
extension EmployeeExtension on Employee {
  /// Get initials from name (e.g., "John Doe" -> "JD")
  String get initials {
    final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}
