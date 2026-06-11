import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/providers.dart';
import '../../core/widgets/api_image.dart';
import '../aadhaar/aadhaar_decoder.dart';
import '../aadhaar/aadhaar_verify_screen.dart';
import '../printing/badge_printer.dart';

/// Safety-officer worker registration / editing. Creates WORKER / STAFF /
/// VISITOR records with optional photo (camera or gallery) and Aadhaar-QR
/// autofill. The badge can be printed straight after saving.
class WorkerEditScreen extends ConsumerStatefulWidget {
  const WorkerEditScreen({super.key, this.workerId});

  /// Null = create new.
  final String? workerId;

  @override
  ConsumerState<WorkerEditScreen> createState() => _WorkerEditScreenState();
}

class _WorkerEditScreenState extends ConsumerState<WorkerEditScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _mobile = TextEditingController();
  final _pincode = TextEditingController();
  final _bloodGroup = TextEditingController();
  final _emergencyName = TextEditingController();
  final _emergencyNumber = TextEditingController();
  final _aadhaar = TextEditingController();

  String _category = 'WORKER';
  String? _gender;
  DateTime? _dob;
  String? _designationId;
  String? _vendorId;
  String? _photoUrl;
  bool _saving = false;
  bool _uploadingPhoto = false;
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _designations = [];
  List<Map<String, dynamic>> _vendors = [];
  String? _siteId;
  String? _siteName;
  Map<String, dynamic>? _existing;

  bool get _isEdit => widget.workerId != null;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _code,
      _mobile,
      _pincode,
      _bloodGroup,
      _emergencyName,
      _emergencyNumber,
      _aadhaar,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final db = ref.read(localDbProvider);
    _siteId = await db.getMeta('active_site');
    _siteName = await db.getMeta('active_site_name');
    final dio = ref.read(apiClientProvider).dio;
    try {
      final results = await Future.wait([
        dio.get('/designations'),
        dio.get('/vendors'),
        if (_isEdit) dio.get('/workers/${widget.workerId}'),
      ]);
      _designations = (results[0].data as List).cast<Map<String, dynamic>>();
      _vendors = (results[1].data as List)
          .cast<Map<String, dynamic>>()
          .where((v) => v['isActive'] != false)
          .toList();
      if (_isEdit) {
        final w = results[2].data as Map<String, dynamic>;
        _existing = w;
        _name.text = (w['fullName'] ?? '') as String;
        _code.text = (w['workerCode'] ?? '') as String;
        _mobile.text = (w['mobileNumber'] ?? '') as String? ?? '';
        _pincode.text = (w['pincode'] ?? '') as String? ?? '';
        _bloodGroup.text = (w['bloodGroup'] ?? '') as String? ?? '';
        _emergencyName.text = (w['emergencyContactName'] ?? '') as String? ?? '';
        _emergencyNumber.text = (w['emergencyContactNumber'] ?? '') as String? ?? '';
        _category = (w['category'] as String?) ?? 'WORKER';
        _gender = w['gender'] as String?;
        _designationId = w['designationId'] as String?;
        _vendorId = w['vendorId'] as String?;
        _photoUrl = w['photoUrl'] as String?;
        final dobStr = w['dateOfBirth'] as String?;
        if (dobStr != null) _dob = DateTime.tryParse(dobStr);
      }
      if (mounted) setState(() => _loading = false);
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _error = _friendlyError(e, 'Failed to load form data');
          _loading = false;
        });
      }
    }
  }

  String _friendlyError(DioException e, String fallback) {
    final data = e.response?.data;
    final detail = data is Map ? (data['detail'] ?? data['title']) : null;
    if (detail is String && detail.isNotEmpty) return detail;
    if (e.response?.statusCode == 403) {
      return 'Your account does not have permission for this — ask an admin to check your role.';
    }
    return e.message ?? fallback;
  }

  Future<void> _pickPhoto(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 800,
      maxHeight: 800,
      imageQuality: 75,
    );
    if (picked == null) return;
    setState(() => _uploadingPhoto = true);
    try {
      final bytes = await picked.readAsBytes();
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.post('/files', data: {
        'dataBase64': base64Encode(bytes),
        'mimeType': 'image/jpeg',
      });
      if (mounted) setState(() => _photoUrl = res.data['url'] as String);
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Photo upload failed: ${e.message ?? 'network'}')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  void _choosePhotoSource() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Take photo'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.gallery);
              },
            ),
            if (_photoUrl != null)
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Remove photo'),
                onTap: () {
                  Navigator.pop(ctx);
                  setState(() => _photoUrl = null);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _scanAadhaar() async {
    final data = await Navigator.of(context).push<AadhaarData>(
      MaterialPageRoute(builder: (_) => const AadhaarVerifyScreen(popWithResult: true)),
    );
    if (data == null || !mounted) return;
    setState(() {
      if (data.name != null && _name.text.isEmpty) _name.text = data.name!;
      if (data.gender != null) {
        _gender = data.gender == 'M' || data.gender == 'F' ? data.gender : 'OTHER';
      }
      final iso = data.dobIso;
      if (iso != null) _dob = DateTime.tryParse(iso);
      if (data.pincode != null && _pincode.text.isEmpty) _pincode.text = data.pincode!;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Details filled from Aadhaar QR. The full Aadhaar number is not in the QR — '
          'enter it manually if required.',
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final dio = ref.read(apiClientProvider).dio;
    final body = <String, dynamic>{
      'fullName': _name.text.trim(),
      if (!_isEdit && _code.text.trim().isNotEmpty) 'workerCode': _code.text.trim(),
      'category': _category,
      if (_gender != null) 'gender': _gender,
      if (_dob != null) 'dateOfBirth': _dob!.toIso8601String().substring(0, 10),
      if (_mobile.text.trim().isNotEmpty) 'mobileNumber': _mobile.text.trim(),
      if (_pincode.text.trim().isNotEmpty) 'pincode': _pincode.text.trim(),
      if (_bloodGroup.text.trim().isNotEmpty) 'bloodGroup': _bloodGroup.text.trim(),
      if (_emergencyName.text.trim().isNotEmpty)
        'emergencyContactName': _emergencyName.text.trim(),
      if (_emergencyNumber.text.trim().isNotEmpty)
        'emergencyContactNumber': _emergencyNumber.text.trim(),
      if (_designationId != null) 'designationId': _designationId,
      if (_vendorId != null) 'vendorId': _vendorId,
      if (_photoUrl != null) 'photoUrl': _photoUrl,
      if (_aadhaar.text.trim().isNotEmpty) ...{
        'govIdType': 'Aadhaar',
        'aadhaar': _aadhaar.text.trim(),
      },
      if (!_isEdit && _siteId != null) 'siteId': _siteId,
    };

    try {
      final Map<String, dynamic> saved;
      if (_isEdit) {
        final res = await dio.patch('/workers/${widget.workerId}', data: body);
        saved = res.data as Map<String, dynamic>;
      } else {
        final res = await dio.post('/workers', data: body);
        saved = res.data as Map<String, dynamic>;
      }
      if (!mounted) return;
      final printNow = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(_isEdit ? 'Saved' : 'Created — ${saved['workerCode']}'),
          content: const Text('Print the QR badge now?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Print badge'),
            ),
          ],
        ),
      );
      if (printNow == true) {
        await printBadges([
          BadgeData(
            fullName: saved['fullName'] as String? ?? _name.text,
            workerCode: saved['workerCode'] as String? ?? _code.text,
            designation: _designations
                .firstWhere((d) => d['id'] == _designationId, orElse: () => {})['name']
                as String?,
            vendor: _vendors.firstWhere((v) => v['id'] == _vendorId, orElse: () => {})['name']
                as String?,
            siteName: _siteName,
          ),
        ]);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = _friendlyError(e, 'Save failed');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit
            ? 'Edit — ${_existing?['fullName'] ?? ''}'
            : 'New ${_category == 'WORKER' ? 'worker' : _category.toLowerCase()}'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!,
                          style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  Row(
                    children: [
                      GestureDetector(
                        onTap: _uploadingPhoto ? null : _choosePhotoSource,
                        child: _uploadingPhoto
                            ? const CircleAvatar(radius: 36, child: CircularProgressIndicator())
                            : ApiCircleAvatar(photoUrl: _photoUrl, radius: 36),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _uploadingPhoto ? null : _choosePhotoSource,
                          icon: const Icon(Icons.photo_camera),
                          label: Text(_photoUrl == null ? 'Add photo (optional)' : 'Change photo'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (!_isEdit)
                    OutlinedButton.icon(
                      onPressed: _scanAadhaar,
                      icon: const Icon(Icons.qr_code_scanner),
                      label: const Text('Scan Aadhaar QR to autofill'),
                    ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _category,
                    decoration: const InputDecoration(
                        labelText: 'Type', border: OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(value: 'WORKER', child: Text('Worker')),
                      DropdownMenuItem(value: 'STAFF', child: Text('Staff')),
                      DropdownMenuItem(value: 'VISITOR', child: Text('Visitor')),
                    ],
                    onChanged: _isEdit ? null : (v) => setState(() => _category = v ?? 'WORKER'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _name,
                    decoration: const InputDecoration(
                        labelText: 'Full name *', border: OutlineInputBorder()),
                    validator: (v) =>
                        (v == null || v.trim().length < 2) ? 'Name is required' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _code,
                    enabled: !_isEdit,
                    decoration: const InputDecoration(
                      labelText: 'ID number (leave blank = auto)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _gender,
                          decoration: const InputDecoration(
                              labelText: 'Gender', border: OutlineInputBorder()),
                          items: const [
                            DropdownMenuItem(value: 'M', child: Text('Male')),
                            DropdownMenuItem(value: 'F', child: Text('Female')),
                            DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                          ],
                          onChanged: (v) => setState(() => _gender = v),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: context,
                              initialDate: _dob ?? DateTime(1995),
                              firstDate: DateTime(1940),
                              lastDate: DateTime.now(),
                            );
                            if (picked != null) setState(() => _dob = picked);
                          },
                          child: Text(
                            _dob == null
                                ? 'Date of birth'
                                : '${_dob!.day}/${_dob!.month}/${_dob!.year}',
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _designationId,
                    decoration: const InputDecoration(
                        labelText: 'Designation', border: OutlineInputBorder()),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('—')),
                      for (final d in _designations)
                        DropdownMenuItem(
                            value: d['id'] as String, child: Text(d['name'] as String)),
                    ],
                    onChanged: (v) => setState(() => _designationId = v),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _vendorId,
                    decoration: InputDecoration(
                      labelText: _category == 'VISITOR' ? 'Company (vendor)' : 'Contractor (vendor)',
                      border: const OutlineInputBorder(),
                    ),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('—')),
                      for (final v in _vendors)
                        DropdownMenuItem(
                            value: v['id'] as String, child: Text(v['name'] as String)),
                    ],
                    onChanged: (v) => setState(() => _vendorId = v),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _mobile,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                        labelText: 'Mobile number', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _pincode,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                              labelText: 'Pincode', border: OutlineInputBorder()),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: _bloodGroup,
                          decoration: const InputDecoration(
                              labelText: 'Blood group', border: OutlineInputBorder()),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _emergencyName,
                    decoration: const InputDecoration(
                        labelText: 'Emergency contact name', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _emergencyNumber,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                        labelText: 'Emergency contact number', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _aadhaar,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: _isEdit
                          ? 'Aadhaar number (blank = keep existing)'
                          : 'Aadhaar number (optional, encrypted)',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: Text(_saving
                        ? 'Saving…'
                        : _isEdit
                            ? 'Save changes'
                            : 'Create & generate QR'),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }
}
