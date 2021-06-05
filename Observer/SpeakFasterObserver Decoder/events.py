"""Utilities relating to events (e.g., audio and visual events)."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function


def convert_events_to_tsv_rows(events,
                               tier,
                               timestep_s=1.0,
                               ignore_class_names=None):
  """Convert the return value of extract_audio_events to tsv rows.

  Args:
    events: The audio event labels as a list of list of tuples. See the doc
      string of extract_audio_events for details.
    tier: Name of the tier that the events beyond to.
    timestep_s: The timestep (in seconds) that corresopnds to the labels list.
    ignore_class_names: A tuple, list or set of class names to ignore.

  Returns:
    TSV rows as a list of list of values: (tbegin, tend, tier, class_name),
      where tier is hardcoded to be AudioEvents.
  """
  tbegin = 0
  rows = []
  active_classes_with_tbegins = []
  # Add sentinel at the end.
  events += [[]]
  for step_events in events:
    current_classes = [item[0] for item in step_events]
    # Find deactivated labels and write them.
    for i in range(len(active_classes_with_tbegins) - 1, -1, -1):
      class_name, class_tbegin = active_classes_with_tbegins[i]
      if ignore_class_names and class_name in ignore_class_names:
        continue
      if class_name not in current_classes:
        rows.append((class_tbegin,
                     tbegin,
                     tier,
                     class_name))
        del active_classes_with_tbegins[i]
    # Find newly active labels.
    for single_label in step_events:
      class_name, _  = single_label
      if ignore_class_names and class_name in ignore_class_names:
        continue
      if not any(item[0] == class_name for item in active_classes_with_tbegins):
        active_classes_with_tbegins.append((class_name, tbegin))
    tbegin += timestep_s
  return rows
