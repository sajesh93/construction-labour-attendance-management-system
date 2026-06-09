import 'dart:async';
import 'dart:convert';
import 'package:nfc_manager/nfc_manager.dart';

/// Result of reading a tag. Either a UID or an NDEF-stored worker code (or both).
class NfcReadResult {
  const NfcReadResult({this.uid, this.ndefText, this.error});
  final String? uid;
  final String? ndefText;
  final String? error;

  bool get hasData => uid != null || ndefText != null;
}

/// Abstraction over NFC so the attendance flow is testable and platform-agnostic.
/// Supports NTAG213/215/216 (UID always; NDEF worker code when present). The tag
/// stores NO PII — only a UID or a worker code.
abstract class NfcReader {
  Future<bool> isAvailable();
  Future<NfcReadResult> readOnce();
  Future<void> stop();
}

class NfcManagerReader implements NfcReader {
  @override
  Future<bool> isAvailable() => NfcManager.instance.isAvailable();

  @override
  Future<NfcReadResult> readOnce() async {
    final completer = Completer<NfcReadResult>();
    try {
      await NfcManager.instance.startSession(
        onDiscovered: (NfcTag tag) async {
          if (!completer.isCompleted) completer.complete(_extract(tag));
          await NfcManager.instance.stopSession();
        },
      );
    } catch (e) {
      return NfcReadResult(error: e.toString());
    }
    return completer.future;
  }

  @override
  Future<void> stop() => NfcManager.instance.stopSession();

  /// Defensive extraction across tag technologies. Reads UID from common
  /// Android tech maps and any NDEF text record; handles empty/locked tags by
  /// falling back to the UID.
  NfcReadResult _extract(NfcTag tag) {
    String? uid;
    String? ndefText;
    try {
      final data = tag.data;
      for (final key in const ['nfca', 'nfcb', 'nfcf', 'nfcv', 'mifareultralight', 'isodep']) {
        final tech = data[key];
        if (tech is Map && tech['identifier'] is List) {
          uid = _toHex((tech['identifier'] as List).cast<int>());
          break;
        }
      }
      final ndef = data['ndef'];
      if (ndef is Map) {
        final cached = ndef['cachedMessage'];
        if (cached is Map && cached['records'] is List) {
          final records = cached['records'] as List;
          if (records.isNotEmpty) {
            final payload = (records.first as Map)['payload'];
            if (payload is List) {
              // NDEF text record: skip the language-code prefix byte.
              final bytes = payload.cast<int>();
              if (bytes.isNotEmpty) {
                final langLen = bytes.first & 0x3f;
                ndefText = utf8.decode(bytes.sublist(1 + langLen), allowMalformed: true);
              }
            }
          }
        }
      }
    } catch (_) {
      // Damaged/unsupported payload — return whatever (likely UID) we got.
    }
    return NfcReadResult(uid: uid, ndefText: ndefText);
  }

  String _toHex(List<int> bytes) =>
      bytes.map((b) => b.toRadixString(16).padLeft(2, '0').toUpperCase()).join();
}
