import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'hotel_common.dart';
import 'id_photos.dart';

// Add a guest who booked straight with the hotel, edit that guest, or fill in the
// counter details of a Hill Booker booking (room, cash taken, ID proof, vehicle).

/// Opens the form. Returns true when something was saved, so the caller can reload.
Future<bool> openGuestForm(
  BuildContext context, {
  required String propertyId,
  Map<String, dynamic>? guest,
  String? roomId,
}) async {
  final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
    builder: (_) => GuestFormScreen(propertyId: propertyId, guest: guest, roomId: roomId),
  ));
  return saved == true;
}

class GuestFormScreen extends StatefulWidget {
  final String propertyId;

  /// A row from the guest register. null means a new direct guest.
  final Map<String, dynamic>? guest;

  /// Pre-pick a room, used by "Check in guest" on a room card.
  final String? roomId;

  const GuestFormScreen({super.key, required this.propertyId, this.guest, this.roomId});

  @override
  State<GuestFormScreen> createState() => _GuestFormScreenState();
}

class _GuestFormScreenState extends State<GuestFormScreen> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _people;
  late final TextEditingController _total;
  late final TextEditingController _paid;
  late final TextEditingController _note;
  late final TextEditingController _address;
  late final TextEditingController _idNumber;
  late final TextEditingController _vehicleModel;
  late final TextEditingController _vehicleNumber;

  DateTime _checkIn = today();
  DateTime _checkOut = today().add(const Duration(days: 1));
  String? _roomId;
  String? _idType;

  List<Map<String, dynamic>> _rooms = [];
  List<String> _havePhotos = [];
  final Map<String, Uint8List> _staged = <String, Uint8List>{};

  bool _loadingRooms = true;
  bool _busy = false;
  String _error = '';
  bool _changed = false;

  /// A Hill Booker booking, not the hotel's own guest. Fewer fields can be edited.
  bool get _booking => text(widget.guest?['source']) == 'hillbooker';
  bool get _isNew => widget.guest == null;
  String get _recordId => text(widget.guest?['id']);

  @override
  void initState() {
    super.initState();
    final g = widget.guest;
    _name = TextEditingController(text: text(g?['name']));
    _phone = TextEditingController(text: text(g?['phone']));
    _people = TextEditingController(text: g == null ? '1' : toNum(g['people']).toInt().toString());
    _total = TextEditingController(text: g == null ? '' : toNum(g['total_amount']).round().toString());
    _paid = TextEditingController(text: g == null ? '' : toNum(g['collected']).round().toString());
    _note = TextEditingController(text: text(g?['note']));
    _address = TextEditingController(text: text(g?['address']));
    _idNumber = TextEditingController(text: text(g?['id_number']));
    _vehicleModel = TextEditingController(text: text(g?['vehicle_model']));
    _vehicleNumber = TextEditingController(text: text(g?['vehicle_number']));

    if (g != null) {
      _checkIn = tryDay(g['check_in']) ?? today();
      _checkOut = tryDay(g['check_out']) ?? _checkIn.add(const Duration(days: 1));
      _roomId = text(g['room_id']).isEmpty ? null : text(g['room_id']);
      final t = text(g['id_type']);
      _idType = t.isEmpty ? null : t;
      _havePhotos = g['id_photos'] is List ? (g['id_photos'] as List).map((e) => '$e').toList() : <String>[];
    }
    _roomId = widget.roomId ?? _roomId;
    _loadRooms();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _people.dispose();
    _total.dispose();
    _paid.dispose();
    _note.dispose();
    _address.dispose();
    _idNumber.dispose();
    _vehicleModel.dispose();
    _vehicleNumber.dispose();
    super.dispose();
  }

  Future<void> _loadRooms() async {
    final res = await Api.get('/hotel/${widget.propertyId}/rooms');
    if (!mounted) return;
    setState(() {
      _loadingRooms = false;
      if (res.ok) _rooms = rowList(rowMap(res.data)['rooms']);
    });
  }

  /// Free rooms, plus whichever room this guest already has.
  Map<String, String> _roomOptions() {
    final out = <String, String>{};
    for (final r in _rooms) {
      final id = text(r['id']);
      final status = text(r['status']);
      final mine = id == _roomId;
      final taken = text(r['guest_id']).isNotEmpty;
      if (mine || (!taken && status == 'free')) {
        final type = text(r['room_type']);
        out[id] = type.isEmpty ? text(r['label']) : '${r['label']} · $type';
      }
    }
    return out;
  }

  String? _problem() {
    if (_booking) return null;
    if (_name.text.trim().isEmpty) return "Enter the guest's name.";
    if (!_checkOut.isAfter(_checkIn)) return 'Check-out must be after check-in.';
    final people = int.tryParse(_people.text.trim());
    if (people == null || people < 1) return 'How many people are staying?';
    final total = parseMoney(_total.text) ?? 0;
    final paid = parseMoney(_paid.text) ?? 0;
    if (total < 0 || paid < 0) return "Amounts can't be less than zero.";
    if (paid > total) return 'The amount paid is more than the total.';
    if (_idNumber.text.trim().isNotEmpty && _idType == null) return 'Choose the type of ID proof.';
    if (_idType == 'aadhaar') {
      final n = _idNumber.text.trim();
      if (n.isNotEmpty && (n.length != 4 || int.tryParse(n) == null)) {
        return 'For Aadhaar, enter only the last 4 digits.';
      }
    }
    return null;
  }

  Map<String, dynamic> _idBits() => {
        'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
        'address': _address.text.trim().isEmpty ? null : _address.text.trim(),
        'id_type': _idType,
        'id_number': _idNumber.text.trim().isEmpty ? null : _idNumber.text.trim(),
        'vehicle_model': _vehicleModel.text.trim().isEmpty ? null : _vehicleModel.text.trim(),
        'vehicle_number': _vehicleNumber.text.trim().isEmpty ? null : _vehicleNumber.text.trim(),
      };

  Future<void> _save() async {
    final problem = _problem();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });

    ApiResult res;
    if (_booking) {
      res = await Api.put('/hotel/bookings/$_recordId/extra', body: {
        'room_id': _roomId,
        'collected': moneyOut(parseMoney(_paid.text) ?? 0),
        ..._idBits(),
      });
    } else {
      final body = <String, dynamic>{
        'name': _name.text.trim(),
        'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
        'check_in': isoDate(_checkIn),
        'check_out': isoDate(_checkOut),
        'room_id': _roomId,
        'people': int.parse(_people.text.trim()),
        'total_amount': moneyOut(parseMoney(_total.text) ?? 0),
        'paid_amount': moneyOut(parseMoney(_paid.text) ?? 0),
        ..._idBits(),
      };
      res = _isNew
          ? await Api.post('/hotel/${widget.propertyId}/guests', body: body)
          : await Api.patch('/hotel/guests/$_recordId', body: body);
    }

    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _error = res.error;
      });
      return;
    }

    // A new guest has an id only now, so any photos taken during the form go up here.
    final newId = _isNew ? text(rowMap(res.data)['id']) : _recordId;
    if (_staged.isNotEmpty && newId.isNotEmpty) {
      final base = _booking ? '/hotel/bookings/$newId' : '/hotel/guests/$newId';
      for (final entry in _staged.entries) {
        final up = await Api.uploadOne('$base/id-photo/${entry.key}', 'file', 'id-${entry.key}.jpg', entry.value, method: 'PUT');
        if (!mounted) return;
        if (!up.ok) {
          setState(() {
            _busy = false;
            _error = 'The guest was saved, but a photo did not upload: ${up.error}';
            _changed = true;
            _staged.remove(entry.key);
          });
          return;
        }
      }
    }

    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  Future<void> _delete() async {
    final yes = await askYesNo(
      context,
      'Remove this guest?',
      'The record and any ID photos will be deleted, and the nights go back on sale.',
      'Remove',
    );
    if (!yes || !mounted) return;
    setState(() => _busy = true);
    final res = await Api.delete('/hotel/guests/$_recordId');
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _error = res.error;
      });
      return;
    }
    Navigator.of(context).pop(true);
  }

  Future<void> _stage(String side) async {
    XFile? picked;
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
    try {
      picked = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 82);
    } catch (_) {
      if (mounted) snack(context, "We couldn't open the camera. Check the app's permissions in Settings.");
      return;
    }
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    if (!mounted) return;
    setState(() => _staged[side] = bytes);
  }

  @override
  Widget build(BuildContext context) {
    final title = _booking
        ? 'Hill Booker guest'
        : _isNew
            ? 'Add a direct guest'
            : 'Edit this guest';
    final nights = nightsBetween(_checkIn, _checkOut);
    final rooms = _roomOptions();

    return Scaffold(
      appBar: AppBar(
        title: Text(title, style: display(20)),
        actions: [
          if (!_isNew && !_booking)
            IconButton(
              tooltip: 'Remove this guest',
              icon: const Icon(Icons.delete_outline, color: C.brick),
              onPressed: _busy ? null : _delete,
            ),
        ],
      ),
      body: AbsorbPointer(
        absorbing: _busy,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
          children: [
            if (_booking)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: HCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(text(widget.guest?['name']), style: display(18)),
                    const SizedBox(height: 2),
                    Text(
                      '${dayText(widget.guest?['check_in'])} to ${dayText(widget.guest?['check_out'])} · ${plural(nights, 'night')} · ${text(widget.guest?['room_type'])}',
                      style: const TextStyle(color: C.soft),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'This guest booked through Hill Booker, so the dates and the room price come from the booking. Fill in what you collect at the counter and their ID proof.',
                      style: TextStyle(color: C.soft, fontSize: 13),
                    ),
                  ]),
                ),
              ),

            if (!_booking) ...[
              TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: fieldDeco('Guest name')),
              const SizedBox(height: 12),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: fieldDeco('Phone', hint: 'Optional'),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: HDateField(
                    label: 'Check-in',
                    value: _checkIn,
                    onChanged: (d) => setState(() {
                      _checkIn = d;
                      if (!_checkOut.isAfter(_checkIn)) _checkOut = _checkIn.add(const Duration(days: 1));
                    }),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: HDateField(
                    label: 'Check-out',
                    value: _checkOut,
                    first: _checkIn.add(const Duration(days: 1)),
                    onChanged: (d) => setState(() => _checkOut = d),
                  ),
                ),
              ]),
              const SizedBox(height: 6),
              Text(
                '${plural(nights, 'night')}. These nights are taken off sale on Hill Booker while the guest is in the room.',
                style: const TextStyle(color: C.soft, fontSize: 12.5),
              ),
              const SizedBox(height: 12),
            ],

            if (_loadingRooms)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text('Loading rooms…', style: TextStyle(color: C.soft)),
              )
            else
              HChoice(
                label: 'Room',
                value: rooms.containsKey(_roomId) ? _roomId : null,
                options: rooms,
                emptyLabel: 'No room yet',
                onChanged: (v) => setState(() => _roomId = v),
              ),
            if (!_loadingRooms && rooms.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Every room is taken or being cleaned. You can still save the guest and give them a room later.',
                    style: TextStyle(color: C.soft, fontSize: 12.5)),
              ),
            const SizedBox(height: 12),

            if (!_booking) ...[
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _people,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: fieldDeco('People'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _total,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: fieldDeco('Room total ₹'),
                  ),
                ),
              ]),
              const SizedBox(height: 12),
            ],

            TextField(
              controller: _paid,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: fieldDeco(_booking ? 'Cash taken at the counter ₹' : 'Paid so far ₹'),
            ),
            const SizedBox(height: 20),

            Text('ID proof', style: display(17)),
            const SizedBox(height: 8),
            HChoice(
              label: 'Type of ID',
              value: _idType,
              options: idTypeNames,
              emptyLabel: 'Not taken',
              onChanged: (v) => setState(() {
                _idType = v;
                if (v == 'aadhaar' && _idNumber.text.trim().length > 4) _idNumber.clear();
              }),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _idNumber,
              textCapitalization: TextCapitalization.characters,
              keyboardType: _idType == 'aadhaar' ? TextInputType.number : TextInputType.text,
              maxLength: _idType == 'aadhaar' ? 4 : 30,
              decoration: fieldDeco(
                _idType == 'aadhaar' ? 'Last 4 digits of Aadhaar' : 'ID number',
                hint: _idType == 'aadhaar' ? 'Only the last 4 digits' : 'Optional',
              ),
            ),
            if (_idType == 'aadhaar')
              const Padding(
                padding: EdgeInsets.only(bottom: 10),
                child: Text(
                  'Only the last 4 digits are kept. The full Aadhaar number must never be stored, by law.',
                  style: TextStyle(color: C.soft, fontSize: 12.5),
                ),
              ),
            const SizedBox(height: 4),
            Text('Photo of the ID', style: display(15)),
            const SizedBox(height: 6),
            if (_isNew) _stagedPhotos() else _savedPhotos(),
            const SizedBox(height: 20),

            Text('Vehicle', style: display(17)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _vehicleModel,
                  textCapitalization: TextCapitalization.words,
                  decoration: fieldDeco('Car or bike', hint: 'Optional'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _vehicleNumber,
                  textCapitalization: TextCapitalization.characters,
                  decoration: fieldDeco('Number plate', hint: 'Optional'),
                ),
              ),
            ]),
            const SizedBox(height: 16),

            TextField(
              controller: _note,
              maxLines: 2,
              decoration: fieldDeco('Note', hint: 'Anything worth remembering'),
            ),

            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 14),
                child: Text(_error, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w600)),
              ),

            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : (_isNew ? 'Add this guest' : 'Save changes')),
            ),
            if (_changed)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Text('Saved. You can close this screen.', style: TextStyle(color: C.green)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _savedPhotos() {
    return IdPhotoRow(
      base: _booking ? '/hotel/bookings/$_recordId' : '/hotel/guests/$_recordId',
      have: _havePhotos,
      onChanged: () async {
        // Re-read the sides this record now has, so the tiles match the server.
        final res = await Api.get('/hotel/${widget.propertyId}/guests');
        if (!mounted || !res.ok) return;
        for (final g in rowList(rowMap(res.data)['guests'])) {
          if (text(g['id']) == _recordId) {
            final sides = g['id_photos'] is List ? (g['id_photos'] as List).map((e) => '$e').toList() : <String>[];
            setState(() {
              _havePhotos = sides;
              _changed = true;
            });
            return;
          }
        }
      },
    );
  }

  /// For a guest who does not exist yet: hold the photos here and send them after saving.
  Widget _stagedPhotos() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(
        children: idSides.map((side) {
          final bytes = _staged[side];
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: side == 'front' ? 8 : 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(sideLabel(side), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: C.soft)),
                const SizedBox(height: 4),
                AspectRatio(
                  aspectRatio: 1.55,
                  child: Material(
                    color: const Color(0xFFF1F3F0),
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => _stage(side),
                      child: Container(
                        decoration: BoxDecoration(border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
                        child: bytes == null
                            ? const Center(
                                child: Column(mainAxisSize: MainAxisSize.min, children: [
                                  Icon(Icons.add_a_photo_outlined, color: C.green, size: 22),
                                  SizedBox(height: 4),
                                  Text('Add ID photo', style: TextStyle(color: C.green, fontWeight: FontWeight.w700, fontSize: 12.5)),
                                ]),
                              )
                            : ClipRRect(
                                borderRadius: BorderRadius.circular(7),
                                child: Image.memory(
                                  bytes,
                                  fit: BoxFit.cover,
                                  width: double.infinity,
                                  height: double.infinity,
                                ),
                              ),
                      ),
                    ),
                  ),
                ),
                if (bytes != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => setState(() => _staged.remove(side)),
                      icon: const Icon(Icons.close, size: 16, color: C.brick),
                      label: const Text('Remove', style: TextStyle(color: C.brick, fontSize: 12.5)),
                      style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 6), minimumSize: const Size(0, 30)),
                    ),
                  )
                else
                  const SizedBox(height: 30),
              ]),
            ),
          );
        }).toList(),
      ),
      if (_staged.isNotEmpty)
        const Text('These photos go up as soon as the guest is saved.', style: TextStyle(color: C.soft, fontSize: 12.5)),
    ]);
  }
}
