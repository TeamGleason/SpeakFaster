import keypresses_pb2
import sys

# Iterates though all people in the AddressBook and prints info about them.
def ListKeypresses(keypresses):
  for keypress in keypresses.keyPresses:
    print(f"Key:{keypress.KeyPress} Timestamp:{keypress.Timestamp.seconds}")

if len(sys.argv) != 2:
  print(f"Usage: {sys.argv[0]} input_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()

# Read the existing address book.
filename = sys.argv[1]

f = open(filename, "rb")
bytes = f.read()
keypresses.ParseFromString(bytes)
f.close()

ListKeypresses(keypresses)