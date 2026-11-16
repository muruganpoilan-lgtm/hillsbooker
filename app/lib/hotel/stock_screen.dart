import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'hotel_common.dart';

// Stock: linen, toiletries, kitchen and cleaning supplies. Record what comes in
// and what gets used, and get told when something is running low.

class StockSection extends StatefulWidget {
  final String propertyId;
  const StockSection({super.key, required this.propertyId});

  @override
  State<StockSection> createState() => _StockSectionState();
}

class _StockSectionState extends State<StockSection> {
  List<Map<String, dynamic>> _items = [];
  int _low = 0;
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Api.get('/hotel/${widget.propertyId}/stock');
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loading = false;
        _error = res.error;
      });
      return;
    }
    final d = rowMap(res.data);
    setState(() {
      _loading = false;
      _error = '';
      _items = rowList(d['items']);
      _low = toNum(d['low']).toInt();
    });
  }

  Future<void> _itemSheet({Map<String, dynamic>? item}) async {
    final name = TextEditingController(text: text(item?['name']));
    final unit = TextEditingController(text: item == null ? 'pieces' : text(item['unit']));
    final qty = TextEditingController(text: item == null ? '' : qtyText(item['qty']));
    final low = TextEditingController(text: item == null ? '' : qtyText(item['low_level']));
    final note = TextEditingController(text: text(item?['note']));
    String category = text(item?['category']).isEmpty ? 'linen' : text(item!['category']);
    String error = '';

    final saved = await hotelSheet<bool>(
      context,
      item == null ? 'Add something to stock' : text(item['name']),
      (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(
              controller: name,
              textCapitalization: TextCapitalization.sentences,
              decoration: fieldDeco('Name', hint: 'Bath towels, soap bars…'),
            ),
            const SizedBox(height: 12),
            HChoice(
              label: 'Goes under',
              value: category,
              options: stockKindNames,
              onChanged: (v) => setSheet(() => category = v ?? 'other'),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: unit,
                  decoration: fieldDeco('Counted in', hint: 'pieces, kg, litres'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: low,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: fieldDeco('Warn below'),
                ),
              ),
            ]),
            if (item == null) ...[
              const SizedBox(height: 12),
              TextField(
                controller: qty,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: fieldDeco('How many you have now'),
              ),
            ] else
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Text(
                  'To change the count, use Took out or Brought in on the item itself, so the history stays correct.',
                  style: TextStyle(color: C.soft, fontSize: 12.5),
                ),
              ),
            const SizedBox(height: 12),
            TextField(controller: note, decoration: fieldDeco('Note', hint: 'Optional')),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error, style: const TextStyle(color: C.brick)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                if (name.text.trim().isEmpty) {
                  setSheet(() => error = 'Give it a name.');
                  return;
                }
                if (unit.text.trim().isEmpty) {
                  setSheet(() => error = 'What is it counted in? Pieces, kg, litres.');
                  return;
                }
                final lowLevel = parseMoney(low.text) ?? 0;
                final body = <String, dynamic>{
                  'name': name.text.trim(),
                  'category': category,
                  'unit': unit.text.trim(),
                  'low_level': moneyOut(lowLevel),
                  'note': note.text.trim().isEmpty ? null : note.text.trim(),
                };
                if (item == null) body['qty'] = moneyOut(parseMoney(qty.text) ?? 0);
                final res = item == null
                    ? await Api.post('/hotel/${widget.propertyId}/stock', body: body)
                    : await Api.patch('/hotel/stock/${item['id']}', body: body);
                if (!ctx2.mounted) return;
                if (!res.ok) {
                  setSheet(() => error = res.error);
                  return;
                }
                Navigator.of(ctx2).pop(true);
              },
              child: Text(item == null ? 'Add' : 'Save'),
            ),
            if (item != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  final yes = await askYesNo(
                      ctx2, 'Remove ${item['name']}?', 'The item and its history will be deleted.', 'Remove');
                  if (!yes || !ctx2.mounted) return;
                  final res = await Api.delete('/hotel/stock/${item['id']}');
                  if (!ctx2.mounted) return;
                  if (!res.ok) {
                    setSheet(() => error = res.error);
                    return;
                  }
                  Navigator.of(ctx2).pop(true);
                },
                icon: const Icon(Icons.delete_outline, size: 18, color: C.brick),
                label: const Text('Remove', style: TextStyle(color: C.brick)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: C.brick)),
              ),
            ],
          ]);
        },
      ),
    );

    name.dispose();
    unit.dispose();
    qty.dispose();
    low.dispose();
    note.dispose();
    if (saved == true && mounted) await _load();
  }

  Future<void> _moveSheet(Map<String, dynamic> item, bool incoming) async {
    final howMany = TextEditingController();
    final note = TextEditingController();
    String reason = incoming ? 'purchase' : 'used';
    String error = '';
    final reasons = incoming
        ? {'purchase': moveReasonNames['purchase']!, 'correction': moveReasonNames['correction']!}
        : {
            'used': moveReasonNames['used']!,
            'damaged': moveReasonNames['damaged']!,
            'correction': moveReasonNames['correction']!,
          };

    final saved = await hotelSheet<bool>(
      context,
      incoming ? 'Brought in: ${item['name']}' : 'Took out: ${item['name']}',
      (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(
              'You have ${qtyText(item['qty'])} ${item['unit']} now.',
              style: const TextStyle(color: C.soft, fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: howMany,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: fieldDeco('How many ${item['unit']}'),
            ),
            const SizedBox(height: 12),
            HChoice(
              label: 'Why',
              value: reason,
              options: reasons,
              onChanged: (v) => setSheet(() => reason = v ?? (incoming ? 'purchase' : 'used')),
            ),
            const SizedBox(height: 12),
            TextField(controller: note, decoration: fieldDeco('Note', hint: 'Optional')),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error, style: const TextStyle(color: C.brick)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                final v = parseMoney(howMany.text);
                if (v == null || v <= 0) {
                  setSheet(() => error = 'Enter how many.');
                  return;
                }
                final res = await Api.post('/hotel/stock/${item['id']}/move', body: {
                  'change': moneyOut(incoming ? v : -v),
                  'reason': reason,
                  'note': note.text.trim().isEmpty ? null : note.text.trim(),
                });
                if (!ctx2.mounted) return;
                if (!res.ok) {
                  setSheet(() => error = res.error);
                  return;
                }
                Navigator.of(ctx2).pop(true);
              },
              child: Text(incoming ? 'Add to stock' : 'Take out of stock'),
            ),
          ]);
        },
      ),
    );

    howMany.dispose();
    note.dispose();
    if (saved == true && mounted) await _load();
  }

  Future<void> _history(Map<String, dynamic> item) async {
    final res = await Api.get('/hotel/stock/${item['id']}/moves');
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    final moves = rowList(res.data);
    if (!mounted) return;
    await hotelSheet<void>(
      context,
      'History: ${item['name']}',
      (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (moves.isEmpty)
          const HEmpty('Nothing recorded yet.')
        else
          for (final m in moves)
            HCard(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(moveReasonNames[text(m['reason'])] ?? text(m['reason']),
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(
                      '${dayYearText(m['moved_on'])} · left ${qtyText(m['qty_after'])} ${item['unit']}',
                      style: const TextStyle(color: C.soft, fontSize: 12.5),
                    ),
                    if (text(m['note']).isNotEmpty)
                      Text(text(m['note']), style: const TextStyle(color: C.soft, fontSize: 12, fontStyle: FontStyle.italic)),
                  ]),
                ),
                Text(
                  '${toNum(m['change']) > 0 ? '+' : ''}${qtyText(m['change'])}',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: toNum(m['change']) > 0 ? C.green : C.brick,
                  ),
                ),
              ]),
            ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: C.green));
    if (_error.isNotEmpty) {
      return ErrorBox(title: "We couldn't load your stock", message: _error, onRetry: _load);
    }

    final byCategory = <String, List<Map<String, dynamic>>>{};
    for (final i in _items) {
      byCategory.putIfAbsent(text(i['category']), () => []).add(i);
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
        children: [
          FilledButton.icon(
            onPressed: () => _itemSheet(),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add something to stock'),
          ),
          const SizedBox(height: 14),
          if (_low > 0)
            HCard(
              fill: const Color(0xFFFDF4DF),
              border: C.goldText.withValues(alpha: 0.4),
              child: Row(children: [
                const Icon(Icons.warning_amber_outlined, color: C.goldText),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '${plural(_low, 'item')} running low. Buy more before you run out.',
                    style: const TextStyle(color: C.goldText, fontWeight: FontWeight.w700),
                  ),
                ),
              ]),
            ),
          if (_items.isEmpty)
            const HEmpty('Nothing in stock yet. Add your towels, bedsheets, soap and kitchen supplies.'),
          for (final kind in stockKindNames.keys)
            if ((byCategory[kind] ?? []).isNotEmpty) ...[
              HHeading(stockKindNames[kind]!),
              for (final i in byCategory[kind]!) _itemCard(i),
            ],
        ],
      ),
    );
  }

  Widget _itemCard(Map<String, dynamic> i) {
    final low = i['low'] == true;
    return HCard(
      fill: low ? const Color(0xFFFDF4DF) : Colors.white,
      border: low ? C.goldText.withValues(alpha: 0.35) : C.line,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text(i['name']), style: display(16)),
              if (toNum(i['low_level']) > 0)
                Text('Warn below ${qtyText(i['low_level'])} ${i['unit']}',
                    style: const TextStyle(color: C.soft, fontSize: 12.5)),
              if (text(i['note']).isNotEmpty)
                Text(text(i['note']), style: const TextStyle(color: C.soft, fontSize: 12, fontStyle: FontStyle.italic)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(qtyText(i['qty']), style: display(20, color: low ? C.goldText : C.ink)),
            Text(text(i['unit']), style: const TextStyle(color: C.soft, fontSize: 12)),
          ]),
          IconButton(
            tooltip: 'Edit',
            icon: const Icon(Icons.edit_outlined, size: 18, color: C.soft),
            onPressed: () => _itemSheet(item: i),
          ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: OutlinedButton(onPressed: () => _moveSheet(i, false), child: const Text('Took out')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton(onPressed: () => _moveSheet(i, true), child: const Text('Brought in')),
          ),
          IconButton(
            tooltip: 'History',
            icon: const Icon(Icons.history, size: 20, color: C.soft),
            onPressed: () => _history(i),
          ),
        ]),
      ]),
    );
  }
}
