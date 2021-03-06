# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# source: Keypresses.proto
"""Generated protocol buffer code."""
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from google.protobuf import reflection as _reflection
from google.protobuf import symbol_database as _symbol_database
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()


from google.protobuf import timestamp_pb2 as google_dot_protobuf_dot_timestamp__pb2


DESCRIPTOR = _descriptor.FileDescriptor(
  name='Keypresses.proto',
  package='SpeakFasterObserver',
  syntax='proto3',
  serialized_options=None,
  create_key=_descriptor._internal_create_key,
  serialized_pb=b'\n\x10Keypresses.proto\x12\x13SpeakFasterObserver\x1a\x1fgoogle/protobuf/timestamp.proto\"K\n\x08KeyPress\x12\x10\n\x08KeyPress\x18\x01 \x01(\t\x12-\n\tTimestamp\x18\x02 \x01(\x0b\x32\x1a.google.protobuf.Timestamp\"?\n\nKeyPresses\x12\x31\n\nkeyPresses\x18\x01 \x03(\x0b\x32\x1d.SpeakFasterObserver.KeyPressb\x06proto3'
  ,
  dependencies=[google_dot_protobuf_dot_timestamp__pb2.DESCRIPTOR,])




_KEYPRESS = _descriptor.Descriptor(
  name='KeyPress',
  full_name='SpeakFasterObserver.KeyPress',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='KeyPress', full_name='SpeakFasterObserver.KeyPress.KeyPress', index=0,
      number=1, type=9, cpp_type=9, label=1,
      has_default_value=False, default_value=b"".decode('utf-8'),
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='Timestamp', full_name='SpeakFasterObserver.KeyPress.Timestamp', index=1,
      number=2, type=11, cpp_type=10, label=1,
      has_default_value=False, default_value=None,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
  ],
  extensions=[
  ],
  nested_types=[],
  enum_types=[
  ],
  serialized_options=None,
  is_extendable=False,
  syntax='proto3',
  extension_ranges=[],
  oneofs=[
  ],
  serialized_start=74,
  serialized_end=149,
)


_KEYPRESSES = _descriptor.Descriptor(
  name='KeyPresses',
  full_name='SpeakFasterObserver.KeyPresses',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='keyPresses', full_name='SpeakFasterObserver.KeyPresses.keyPresses', index=0,
      number=1, type=11, cpp_type=10, label=3,
      has_default_value=False, default_value=[],
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
  ],
  extensions=[
  ],
  nested_types=[],
  enum_types=[
  ],
  serialized_options=None,
  is_extendable=False,
  syntax='proto3',
  extension_ranges=[],
  oneofs=[
  ],
  serialized_start=151,
  serialized_end=214,
)

_KEYPRESS.fields_by_name['Timestamp'].message_type = google_dot_protobuf_dot_timestamp__pb2._TIMESTAMP
_KEYPRESSES.fields_by_name['keyPresses'].message_type = _KEYPRESS
DESCRIPTOR.message_types_by_name['KeyPress'] = _KEYPRESS
DESCRIPTOR.message_types_by_name['KeyPresses'] = _KEYPRESSES
_sym_db.RegisterFileDescriptor(DESCRIPTOR)

KeyPress = _reflection.GeneratedProtocolMessageType('KeyPress', (_message.Message,), {
  'DESCRIPTOR' : _KEYPRESS,
  '__module__' : 'Keypresses_pb2'
  # @@protoc_insertion_point(class_scope:SpeakFasterObserver.KeyPress)
  })
_sym_db.RegisterMessage(KeyPress)

KeyPresses = _reflection.GeneratedProtocolMessageType('KeyPresses', (_message.Message,), {
  'DESCRIPTOR' : _KEYPRESSES,
  '__module__' : 'Keypresses_pb2'
  # @@protoc_insertion_point(class_scope:SpeakFasterObserver.KeyPresses)
  })
_sym_db.RegisterMessage(KeyPresses)


# @@protoc_insertion_point(module_scope)
