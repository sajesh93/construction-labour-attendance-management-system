import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Full-screen QR scanner. Pops with the decoded string (or null if cancelled).
/// The CLAMS app expects payloads like "CLAMS:W-0001".
///
/// [highDensity] runs the camera at 1920×1080 — required for very dense codes
/// like the Aadhaar Secure QR (thousands of characters), which the default
/// preview resolution cannot resolve.
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({
    super.key,
    this.title = 'Scan worker QR',
    this.hint = 'Point the camera at the worker QR badge',
    this.highDensity = false,
  });

  final String title;
  final String hint;
  final bool highDensity;

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> with WidgetsBindingObserver {
  late final MobileScannerController _controller = MobileScannerController(
    autoStart: false,
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
    cameraResolution: widget.highDensity ? const Size(1920, 1080) : null,
  );
  bool _handled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_controller.start());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        unawaited(_controller.start());
        break;
      case AppLifecycleState.inactive:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        unawaited(_controller.stop());
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final code = capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue : null;
    if (code == null || code.isEmpty) return;
    _handled = true;
    Navigator.of(context).pop(code);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: 'Toggle torch',
            icon: const Icon(Icons.flashlight_on),
            onPressed: () => unawaited(_controller.toggleTorch()),
          ),
        ],
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error, child) {
              return Container(
                color: Colors.black,
                padding: const EdgeInsets.all(24),
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.videocam_off, color: Colors.white, size: 56),
                    const SizedBox(height: 16),
                    Text(
                      'Camera error: ${error.errorCode.name}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      error.errorDetails?.message ??
                          'Grant camera permission in Settings, or use Manual entry.',
                      style: const TextStyle(color: Colors.white70),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => unawaited(_controller.start()),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              );
            },
          ),
          IgnorePointer(
            child: Container(
              width: widget.highDensity ? 300 : 240,
              height: widget.highDensity ? 300 : 240,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 3),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          Positioned(
            bottom: 40,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                widget.hint,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, backgroundColor: Colors.black54),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
