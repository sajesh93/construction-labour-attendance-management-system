import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../attendance/domain/models.dart';

/// Supervisor raises an attendance-correction request (admin approves it).
/// Mirrors the backend CorrectionType / CorrectionReason enums.
class CorrectionRequestScreen extends ConsumerStatefulWidget {
  const CorrectionRequestScreen({super.key, required this.worker});
  final WorkerCard worker;

  @override
  ConsumerState<CorrectionRequestScreen> createState() => _CorrectionRequestScreenState();
}

class _CorrectionRequestScreenState extends ConsumerState<CorrectionRequestScreen> {
  static const _types = ['LOGIN', 'LOGOUT', 'MISSING', 'WRONG_SITE'];
  static const _reasons = [
    'FORGOT_CARD',
    'DEVICE_ISSUE',
    'NETWORK_ISSUE',
    'WRONG_SITE',
    'SUPERVISOR_MISTAKE',
    'OTHER',
  ];

  String _type = 'LOGOUT';
  String _reason = 'FORGOT_CARD';
  DateTime _date = DateTime.now();
  TimeOfDay? _time = TimeOfDay.now();
  final _notes = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  String _label(String s) =>
      s.split('_').map((w) => w[0] + w.substring(1).toLowerCase()).join(' ');

  bool get _needsTime => _type == 'LOGIN' || _type == 'LOGOUT' || _type == 'MISSING';

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final siteId = await ref.read(localDbProvider).getMeta('active_site');
      final items = <Map<String, dynamic>>[];
      if (_needsTime && _time != null) {
        final dt = DateTime(_date.year, _date.month, _date.day, _time!.hour, _time!.minute);
        final field = _type == 'LOGOUT' ? 'logout_at' : 'login_at';
        items.add({'field': field, 'proposedValue': dt.toUtc().toIso8601String()});
      }
      await ref.read(apiClientProvider).dio.post('/corrections', data: {
        'workerId': widget.worker.id,
        'siteId': siteId,
        'workDate': DateTime(_date.year, _date.month, _date.day).toUtc().toIso8601String(),
        'type': _type,
        'reason': _reason,
        'notes': _notes.text.trim(),
        'items': items,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Correction request submitted for approval')),
      );
      Navigator.of(context).pop();
    } on DioException catch (e) {
      final detail = e.response?.data is Map
          ? (e.response?.data['detail'] ?? e.response?.data['title'])
          : null;
      setState(() => _error = (detail as String?) ?? 'Failed to submit request');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Correction · ${widget.worker.fullName}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Correction type', border: OutlineInputBorder()),
            items: _types.map((t) => DropdownMenuItem(value: t, child: Text(_label(t)))).toList(),
            onChanged: (v) => setState(() => _type = v!),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _reason,
            decoration: const InputDecoration(labelText: 'Reason', border: OutlineInputBorder()),
            items: _reasons.map((r) => DropdownMenuItem(value: r, child: Text(_label(r)))).toList(),
            onChanged: (v) => setState(() => _reason = v!),
          ),
          const SizedBox(height: 16),
          ListTile(
            shape: const RoundedRectangleBorder(
              side: BorderSide(color: Colors.grey),
              borderRadius: BorderRadius.all(Radius.circular(4)),
            ),
            title: const Text('Work date'),
            subtitle: Text('${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}'),
            trailing: const Icon(Icons.calendar_today),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _date,
                firstDate: DateTime(2024),
                lastDate: DateTime.now().add(const Duration(days: 1)),
              );
              if (picked != null) setState(() => _date = picked);
            },
          ),
          if (_needsTime) ...[
            const SizedBox(height: 12),
            ListTile(
              shape: const RoundedRectangleBorder(
                side: BorderSide(color: Colors.grey),
                borderRadius: BorderRadius.all(Radius.circular(4)),
              ),
              title: Text(_type == 'LOGOUT' ? 'Proposed logout time' : 'Proposed login time'),
              subtitle: Text(_time?.format(context) ?? 'Not set'),
              trailing: const Icon(Icons.access_time),
              onTap: () async {
                final picked = await showTimePicker(
                    context: context, initialTime: _time ?? TimeOfDay.now());
                if (picked != null) setState(() => _time = picked);
              },
            ),
          ],
          const SizedBox(height: 16),
          TextField(
            controller: _notes,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Notes', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: Text(_busy ? 'Submitting…' : 'Submit request'),
          ),
        ],
      ),
    );
  }
}
