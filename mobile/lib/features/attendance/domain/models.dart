/// Domain models for attendance and workers (limited card data cached offline).
library;

enum TapSource { nfcUid, nfcNdef, qr, manual }

extension TapSourceApi on TapSource {
  String get wire => switch (this) {
        TapSource.nfcUid => 'NFC_UID',
        TapSource.nfcNdef => 'NFC_NDEF',
        TapSource.qr => 'QR',
        TapSource.manual => 'MANUAL',
      };
}

class WorkerCard {
  const WorkerCard({
    required this.id,
    required this.workerCode,
    required this.fullName,
    this.photoUrl,
    this.bloodGroup,
    this.emergencyContactName,
    this.emergencyContactNumber,
    this.nfcUid,
    this.qrIdentifier,
  });

  final String id;
  final String workerCode;
  final String fullName;
  final String? photoUrl;
  final String? bloodGroup;
  final String? emergencyContactName;
  final String? emergencyContactNumber;
  final String? nfcUid;
  final String? qrIdentifier;

  factory WorkerCard.fromMap(Map<String, dynamic> m) => WorkerCard(
        id: m['id'] as String,
        workerCode: (m['workerCode'] ?? m['worker_code'] ?? '') as String,
        fullName: (m['fullName'] ?? m['full_name'] ?? '') as String,
        photoUrl: (m['photoUrl'] ?? m['photo_url']) as String?,
        bloodGroup: (m['bloodGroup'] ?? m['blood_group']) as String?,
        emergencyContactName:
            (m['emergencyContactName'] ?? m['emergency_contact_name']) as String?,
        emergencyContactNumber:
            (m['emergencyContactNumber'] ?? m['emergency_contact_number']) as String?,
        nfcUid: (m['nfcUid'] ?? m['nfc_uid']) as String?,
        qrIdentifier: (m['qrIdentifier'] ?? m['qr_identifier']) as String?,
      );

  Map<String, dynamic> toCacheRow() => {
        'id': id,
        'worker_code': workerCode,
        'full_name': fullName,
        'photo_url': photoUrl,
        'blood_group': bloodGroup,
        'emergency_contact_name': emergencyContactName,
        'emergency_contact_number': emergencyContactNumber,
        'nfc_uid': nfcUid,
        'qr_identifier': qrIdentifier,
      };
}

/// An attendance event queued in the local outbox (durable, idempotent).
class OutboxEvent {
  const OutboxEvent({
    required this.eventId,
    required this.siteId,
    required this.deviceId,
    required this.source,
    required this.identifier,
    required this.clientEventTime,
    this.lat,
    this.lng,
    this.accuracyM,
    this.isManualBackup = false,
    this.manualReason,
    this.synced = false,
    this.attempts = 0,
    this.lastError,
  });

  final String eventId;
  final String siteId;
  final String deviceId;
  final TapSource source;
  final String identifier;
  final DateTime clientEventTime;
  final double? lat;
  final double? lng;
  final double? accuracyM;
  final bool isManualBackup;
  final String? manualReason;
  final bool synced;
  final int attempts;
  final String? lastError;

  Map<String, dynamic> toJson() => {
        'eventId': eventId,
        'siteId': siteId,
        'deviceId': deviceId,
        'source': source.wire,
        'identifier': identifier,
        'clientEventTime': clientEventTime.toUtc().toIso8601String(),
        if (lat != null && lng != null)
          'geo': {'lat': lat, 'lng': lng, if (accuracyM != null) 'accuracyM': accuracyM},
        'manual': {'isBackup': isManualBackup, 'reason': manualReason},
      };
}
