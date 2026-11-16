import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../config.dart';
import '../theme.dart';
import '../widgets/common.dart';

// Photos of a guest's ID proof: front and back. On a phone the camera opens;
// "Choose a file" picks one already on the phone. The photos are kept on the
// server and only this host can see them.

const List<String> idSides = ['front', 'back'];

String sideLabel(String side) => side == 'back' ? 'Back' : 'Front';

/// The two photo tiles. `base` is '/hotel/guests/<id>' or '/hotel/bookings/<id>'.
/// `have` is the list of sides already saved, as the API reports them.
class IdPhotoRow extends StatefulWidget {
  final String base;
  final List<String> have;
  final Future<void> Function() onChanged;

  const IdPhotoRow({super.key, required this.base, required this.have, required this.onChanged});

  @override
  State<IdPhotoRow> createState() => _IdPhotoRowState();
}

class _IdPhotoRowState extends State<IdPhotoRow> {
  final Set<String> _busy = <String>{};
  // Bumped after every upload so Image.network fetches the new photo instead of the cached one.
  int _version = 0;

  Future<void> _add(String side) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined, color: C.green),
            title: const Text('Take a photo'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined, color: C.green),
            title: const Text('Choose a file'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
          ),
        ]),
      ),
    );
    if (source == null || !mounted) return;

    XFile? picked;
    try {
      // Shrink before sending: an ID card is readable at this size and uploads fast on mobile data.
      picked = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 82);
    } catch (_) {
      if (mounted) snack(context, "We couldn't open the camera. Check the app's permissions in Settings.");
      return;
    }
    if (picked == null || !mounted) return;

    setState(() => _busy.add(side));
    final bytes = await picked.readAsBytes();
    final res = await Api.uploadOne('${widget.base}/id-photo/$side', 'file', 'id-$side.jpg', bytes, method: 'PUT');
    if (!mounted) return;
    setState(() {
      _busy.remove(side);
      _version++;
    });
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await widget.onChanged();
  }

  Future<void> _remove(String side) async {
    final yes = await askYesNo(context, 'Remove this photo?', 'The ${sideLabel(side).toLowerCase()} photo of the ID will be deleted.', 'Remove');
    if (!yes || !mounted) return;
    setState(() => _busy.add(side));
    final res = await Api.delete('${widget.base}/id-photo/$side');
    if (!mounted) return;
    setState(() => _busy.remove(side));
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await widget.onChanged();
  }

  void _view(String side) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: Text('${sideLabel(side)} of the ID'),
        ),
        body: Center(
          child: InteractiveViewer(
            maxScale: 5,
            child: Image.network(
              '$apiBase${widget.base}/id-photo/$side?v=$_version',
              headers: Api.imageHeaders(),
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const Text('That photo could not be loaded.', style: TextStyle(color: Colors.white70)),
            ),
          ),
        ),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: idSides.map((side) {
        final has = widget.have.contains(side);
        final busy = _busy.contains(side);
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: side == 'front' ? 8 : 0),
            child: _tile(side, has, busy),
          ),
        );
      }).toList(),
    );
  }

  Widget _tile(String side, bool has, bool busy) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(sideLabel(side), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: C.soft)),
      const SizedBox(height: 4),
      AspectRatio(
        aspectRatio: 1.55,
        child: Material(
          color: const Color(0xFFF1F3F0),
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: busy ? null : (has ? () => _view(side) : () => _add(side)),
            child: Container(
              decoration: BoxDecoration(
                border: Border.all(color: C.line),
                borderRadius: BorderRadius.circular(8),
              ),
              child: busy
                  ? const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: C.green)))
                  : has
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(7),
                          child: Image.network(
                            '$apiBase${widget.base}/id-photo/$side?v=$_version',
                            headers: Api.imageHeaders(),
                            fit: BoxFit.cover,
                            width: double.infinity,
                            height: double.infinity,
                            errorBuilder: (_, __, ___) => const Center(child: Icon(Icons.broken_image_outlined, color: C.soft)),
                          ),
                        )
                      : const Center(
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.add_a_photo_outlined, color: C.green, size: 22),
                            SizedBox(height: 4),
                            Text('Add ID photo', style: TextStyle(color: C.green, fontWeight: FontWeight.w700, fontSize: 12.5)),
                          ]),
                        ),
            ),
          ),
        ),
      ),
      if (has)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: busy ? null : () => _remove(side),
            icon: const Icon(Icons.delete_outline, size: 16, color: C.brick),
            label: const Text('Remove', style: TextStyle(color: C.brick, fontSize: 12.5)),
            style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 6), minimumSize: const Size(0, 30)),
          ),
        ),
      if (!has) const SizedBox(height: 30),
    ]);
  }
}
