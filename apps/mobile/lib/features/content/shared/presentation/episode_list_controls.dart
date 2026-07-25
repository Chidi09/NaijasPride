import 'package:flutter/material.dart';

/// Splits a long episode list into fixed-size number ranges (e.g. "1-100",
/// "101-200"), for shows with hundreds of episodes where rendering one flat
/// list is both slow and hard to navigate.
List<({int start, int end})> episodeRanges(int episodeCount, {int chunkSize = 100}) {
  final ranges = <({int start, int end})>[];
  for (var start = 1; start <= episodeCount; start += chunkSize) {
    final end = (start + chunkSize - 1).clamp(1, episodeCount);
    ranges.add((start: start, end: end));
  }
  return ranges;
}

class EpisodeRangeSelector extends StatelessWidget {
  final List<({int start, int end})> ranges;
  final int selectedIndex;
  final ValueChanged<int> onChanged;

  const EpisodeRangeSelector({
    super.key,
    required this.ranges,
    required this.selectedIndex,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return DropdownButton<int>(
      value: selectedIndex.clamp(0, ranges.length - 1),
      isDense: true,
      items: List.generate(ranges.length, (i) {
        final r = ranges[i];
        return DropdownMenuItem(value: i, child: Text('${r.start}-${r.end}'));
      }),
      onChanged: (index) {
        if (index != null) onChanged(index);
      },
    );
  }
}

class EpisodeFilterField extends StatefulWidget {
  final ValueChanged<String> onChanged;

  const EpisodeFilterField({super.key, required this.onChanged});

  @override
  State<EpisodeFilterField> createState() => _EpisodeFilterFieldState();
}

class _EpisodeFilterFieldState extends State<EpisodeFilterField> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onChanged: widget.onChanged,
      decoration: const InputDecoration(
        isDense: true,
        prefixIcon: Icon(Icons.search, size: 18),
        hintText: 'Filter episodes',
        border: OutlineInputBorder(),
      ),
    );
  }
}
