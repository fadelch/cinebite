import { generateSeatsSchema } from "@/validation/seat";

export function seatRowOrdinal(row: string): number {
  return [...row].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}

function numberToRow(value: number): string {
  let remaining = value;
  let row = "";

  while (remaining > 0) {
    remaining -= 1;
    row = String.fromCharCode(65 + (remaining % 26)) + row;
    remaining = Math.floor(remaining / 26);
  }

  return row;
}

export function seatDocumentId(label: string): string {
  return label.toLowerCase();
}

export function generateSeatLayout(input: unknown) {
  const data = generateSeatsSchema.parse(input);
  const firstRow = seatRowOrdinal(data.startingRow);
  const lastRow = firstRow + data.numberOfRows - 1;

  if (lastRow > seatRowOrdinal("ZZZ")) {
    throw new Error("The generated row range exceeds ZZZ.");
  }

  const seats = Array.from({ length: data.numberOfRows }, (_, rowIndex) => {
    const row = numberToRow(firstRow + rowIndex);
    return Array.from({ length: data.seatsPerRow }, (_, seatIndex) => {
      const number = data.startingSeatNumber + seatIndex;
      return { row, number, label: `${row}${number}` };
    });
  }).flat();

  return { seats, total: seats.length };
}
