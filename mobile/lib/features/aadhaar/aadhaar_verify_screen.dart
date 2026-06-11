import 'package:flutter/material.dart';

import 'aadhaar_decoder.dart';
import 'aadhaar_scan_screen.dart';

/// Scans an Aadhaar QR and shows the decoded details so the safety officer can
/// cross-verify them against the printed card (suspected tampering check).
class AadhaarVerifyScreen extends StatefulWidget {
  const AadhaarVerifyScreen({super.key, this.popWithResult = false});

  /// When true, "Use these details" pops with the [AadhaarData] so the caller
  /// (worker form) can autofill.
  final bool popWithResult;

  @override
  State<AadhaarVerifyScreen> createState() => _AadhaarVerifyScreenState();
}

class _AadhaarVerifyScreenState extends State<AadhaarVerifyScreen> {
  AadhaarData? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scan());
  }

  Future<void> _scan() async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const AadhaarScanScreen()),
    );
    if (!mounted) return;
    if (raw == null) {
      if (_data == null) Navigator.of(context).pop();
      return;
    }
    final decoded = decodeAadhaarQr(raw);
    setState(() {
      if (decoded == null) {
        _error =
            'Not a readable Aadhaar QR. Make sure you scan the QR on the Aadhaar card/letter (not a CLAMS badge).';
      } else {
        _data = decoded;
        _error = null;
      }
    });
  }

  Widget _row(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: const TextStyle(color: Colors.black54)),
          ),
          Expanded(
            child: Text(
              value ?? '—',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Aadhaar verification')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: d == null
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_error != null) ...[
                      Icon(Icons.error_outline, size: 48, color: Colors.red.shade400),
                      const SizedBox(height: 12),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                    ],
                    FilledButton.icon(
                      onPressed: _scan,
                      icon: const Icon(Icons.qr_code_scanner),
                      label: const Text('Scan Aadhaar QR'),
                    ),
                  ],
                ),
              )
            : ListView(
                children: [
                  Card(
                    color: d.secure ? Colors.green.shade50 : Colors.orange.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Icon(
                            d.secure ? Icons.verified_user : Icons.warning_amber,
                            color: d.secure ? Colors.green.shade700 : Colors.orange.shade800,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              d.secure
                                  ? 'UIDAI Secure QR decoded. Cross-check every field below '
                                      'against the printed card — any mismatch means the card '
                                      'was modified.'
                                  : 'Legacy XML QR (older card). Details below come from the '
                                      'QR itself — cross-check against the printed card.',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _row('Name', d.name),
                          _row('Aadhaar (last 4)', d.aadhaarLast4 ?? d.referenceId),
                          _row('Date of birth', d.dob ?? d.yob),
                          _row('Gender', d.gender),
                          _row('Care of', d.careOf),
                          _row('Address', d.fullAddress.isEmpty ? null : d.fullAddress),
                          _row('Pincode', d.pincode),
                          if (d.mobileLast4 != null) _row('Mobile (last 4)', d.mobileLast4),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (widget.popWithResult)
                    FilledButton.icon(
                      onPressed: () => Navigator.of(context).pop(d),
                      icon: const Icon(Icons.check),
                      label: const Text('Use these details'),
                    ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _scan,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('Scan another'),
                  ),
                ],
              ),
      ),
    );
  }
}
