"""Binary for object detection on input images."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import csv
import glob

import object_detection
import events as events_lib
import tsv_data

parser = argparse.ArgumentParser()
parser.add_argument(
    "--input_image_glob",
    help="Glob pattern for image inputs. "
    "Mutually exclusive with --input_video_path")
parser.add_argument(
    "--frame_rate",
    default=None,
    type=float,
    help="Frame rate of the images from the glob pattern. "
    "Required if --input_image_glob is specified.")
parser.add_argument(
    "--input_video_path",
    help="Path to input video file (e.g., mp4). "
    "Mutually exclusive with --input_image_glob")
parser.add_argument(
    "--output_tsv_path", help="Path to output tsv file")


def main():
  args = parser.parse_args()
  print("50")
  if args.input_image_glob:
    if args.input_video_path:
      raise ValueError(
          "--input_image_glob and --input_video_path are mutually exclusive")
    if args.frame_rate is None:
      raise ValueError(
          "When --input_image_glob is provided, --frame_rate must be provided")
    frame_generator = object_detection.read_images(
        args.input_image_glob, frame_rate=args.frame_rate)
    timestep_s = 1.0 / args.frame_rate
  else:
    if not args.input_video_path:
      raise ValueError(
          "One of --input_image_glob and --input_video_path must be provided")
    frame_generator = object_detection.read_video_file(args.input_video_path)
    timestep_s = 1.0 / object_detection.get_video_fps(args.input_video_path)
      # TODO(cais): Support variable frame rate in video file.
  events = object_detection.detect_objects(frame_generator)

  tsv_rows = events_lib.convert_events_to_tsv_rows(
      events,
      tsv_data.VISUAL_OBJECTS_EVENTS_TIER,
      timestep_s=timestep_s)
  with open(args.output_tsv_path, mode="w") as f:
    tsv_writer = csv.writer(f, delimiter="\t")
    tsv_writer.writerow(tsv_data.COLUMN_HEADS)
    for row in tsv_rows:
      tsv_writer.writerow(row)


if __name__ == "__main__":
  main()
