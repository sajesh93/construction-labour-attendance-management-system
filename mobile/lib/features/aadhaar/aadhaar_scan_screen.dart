import 'dart:async';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_zxing/flutter_zxing.dart' hide ImageFormat;
import 'package:flutter_zxing/flutter_zxing.dart' as zxing show ImageFormat;

/// Live Aadhaar Secure QR scanner with a fully controlled camera pipeline:
///  • highest supported camera resolution (falls back gracefully)
///  • starts at 2× zoom so the card is held farther away, inside the lens's
///    focus range — the usual reason dense-QR scans fail on budget phones
///  • tap anywhere to refocus; pinch/slider zoom; torch toggle
///  • stride-safe luminance frames → native zxing-cpp (tryHarder) off the UI
///    thread, ~3 attempts/second
/// Pops with the raw decoded string, or null if cancelled.
class AadhaarScanScreen extends StatefulWidget {
  const AadhaarScanScreen({super.key});

  @override
  State<AadhaarScanScreen> createState() => _AadhaarScanScreenState();
}

class _AadhaarScanScreenState extends State<AadhaarScanScreen>
    with WidgetsBindingObserver {
  CameraController? _cam;
  bool _handled = false;
  bool _busy = false;
  DateTime _lastAttempt = DateTime.fromMillisecondsSinceEpoch(0);
  int _attempts = 0;
  double _zoom = 1;
  double _maxZoom = 1;
  bool _torch = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_init());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cam?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _cam == null) {
      unawaited(_init());
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      final cam = _cam;
      _cam = null;
      unawaited(cam?.dispose());
    }
  }

  Future<void> _init() async {
    try {
      final cameras = await availableCameras();
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      CameraController? cam;
      for (final preset in [
        ResolutionPreset.ultraHigh,
        ResolutionPreset.veryHigh,
        ResolutionPreset.high,
      ]) {
        try {
          cam = CameraController(
            back,
            preset,
            enableAudio: false,
            imageFormatGroup: ImageFormatGroup.yuv420,
          );
          await cam.initialize();
          break;
        } catch (_) {
          await cam?.dispose();
          cam = null;
        }
      }
      if (cam == null) {
        setState(() => _error = 'Could not start the camera.');
        return;
      }

      try {
        await cam.setFocusMode(FocusMode.auto);
        await cam.setExposureMode(ExposureMode.auto);
      } catch (_) {}

      _maxZoom = 1;
      try {
        _maxZoom = await cam.getMaxZoomLevel();
      } catch (_) {}
      // Start zoomed in: the card sits farther from the lens (inside the
      // focus range) while the QR still fills the frame.
      _zoom = _maxZoom >= 2.0 ? 2.0 : _maxZoom;
      try {
        await cam.setZoomLevel(_zoom);
      } catch (_) {}

      await cam.startImageStream(_onFrame);
      if (!mounted) {
        await cam.dispose();
        return;
      }
      setState(() {
        _cam = cam;
        _error = null;
      });
    } on CameraException catch (e) {
      if (mounted) {
        setState(() => _error =
            'Camera unavailable: ${e.description ?? e.code}. Grant camera permission and retry.');
      }
    }
  }

  /// Tightly packed luminance plane — handles devices that pad frame rows
  /// (the classic cause of "stretched"/undecodable frames).
  static Uint8List _packY(CameraImage img) {
    final plane = img.planes.first;
    if (plane.bytesPerRow == img.width) return plane.bytes;
    final packed = Uint8List(img.width * img.height);
    for (var row = 0; row < img.height; row++) {
      packed.setRange(
        row * img.width,
        row * img.width + img.width,
        plane.bytes,
        row * plane.bytesPerRow,
      );
    }
    return packed;
  }

  Future<void> _onFrame(CameraImage img) async {
    if (_handled || _busy) return;
    final now = DateTime.now();
    if (now.difference(_lastAttempt).inMilliseconds < 300) return;
    _lastAttempt = now;
    _busy = true;
    try {
      final bytes = _packY(img);
      final w = img.width;
      final h = img.height;
      final text = await Isolate.run(() {
        final code = zx.readBarcode(
          bytes,
          DecodeParams(
            imageFormat: zxing.ImageFormat.lum,
            format: Format.qrCode,
            width: w,
            height: h,
            tryHarder: true,
            tryRotate: true,
            tryInverted: true,
          ),
        );
        return code.isValid ? code.text : null;
      });
      if (!mounted || _handled) return;
      _attempts += 1;
      if (text != null && text.isNotEmpty) {
        _handled = true;
        try {
          await _cam?.stopImageStream();
        } catch (_) {}
        if (mounted) Navigator.of(context).pop(text);
        return;
      }
      if (_attempts % 6 == 0) setState(() {});
    } catch (_) {
      // Bad frame — skip it.
    } finally {
      _busy = false;
    }
  }

  Future<void> _setZoom(double z) async {
    _zoom = z.clamp(1.0, _maxZoom);
    try {
      await _cam?.setZoomLevel(_zoom);
    } catch (_) {}
    setState(() {});
  }

  Future<void> _toggleTorch() async {
    _torch = !_torch;
    try {
      await _cam?.setFlashMode(_torch ? FlashMode.torch : FlashMode.off);
    } catch (_) {}
    setState(() {});
  }

  Future<void> _focusAt(TapDownDetails d, BoxConstraints box) async {
    final point = Offset(
      (d.localPosition.dx / box.maxWidth).clamp(0.0, 1.0),
      (d.localPosition.dy / box.maxHeight).clamp(0.0, 1.0),
    );
    try {
      await _cam?.setFocusPoint(point);
      await _cam?.setExposurePoint(point);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final cam = _cam;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scan Aadhaar QR'),
        actions: [
          IconButton(
            tooltip: 'Torch',
            icon: Icon(_torch ? Icons.flashlight_off : Icons.flashlight_on),
            onPressed: _toggleTorch,
          ),
        ],
      ),
      body: _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!,
                        style: const TextStyle(color: Colors.white),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton(onPressed: _init, child: const Text('Retry')),
                  ],
                ),
              ),
            )
          : cam == null || !cam.value.isInitialized
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, box) => GestureDetector(
                          onTapDown: (d) => _focusAt(d, box),
                          child: Stack(
                            alignment: Alignment.center,
                            fit: StackFit.expand,
                            children: [
                              ClipRect(
                                child: OverflowBox(
                                  alignment: Alignment.center,
                                  child: FittedBox(
                                    fit: BoxFit.cover,
                                    child: SizedBox(
                                      width: box.maxWidth,
                                      height:
                                          box.maxWidth * cam.value.aspectRatio,
                                      child: CameraPreview(cam),
                                    ),
                                  ),
                                ),
                              ),
                              IgnorePointer(
                                child: Center(
                                  child: Container(
                                    width: 280,
                                    height: 280,
                                    decoration: BoxDecoration(
                                      border: Border.all(
                                          color: Colors.white, width: 3),
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                ),
                              ),
                              Positioned(
                                bottom: 12,
                                left: 0,
                                right: 0,
                                child: Text(
                                  _attempts == 0
                                      ? 'Center the Aadhaar QR in the box.\nTap the QR to focus if it looks blurry.'
                                      : 'Scanning… move slightly closer or farther until sharp.',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    backgroundColor: Colors.black54,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Container(
                      color: Colors.black,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(
                        children: [
                          const Icon(Icons.zoom_out, color: Colors.white70),
                          Expanded(
                            child: Slider(
                              value: _zoom.clamp(1.0, _maxZoom),
                              min: 1.0,
                              max: _maxZoom < 1.5 ? 1.5 : _maxZoom.clamp(1.5, 8.0),
                              onChanged: _maxZoom <= 1.0 ? null : _setZoom,
                            ),
                          ),
                          const Icon(Icons.zoom_in, color: Colors.white70),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}
