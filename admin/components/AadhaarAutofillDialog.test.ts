import { describe, expect, it } from 'vitest';
import { fillsFor } from './AadhaarAutofillDialog';
import { AadhaarData } from '@/lib/aadhaar/decoder';

const CARD: AadhaarData = {
  referenceId: '482919700123456',
  name: 'Ganesh Moorthy',
  dob: '31-12-1990',
  gender: 'M',
  careOf: 'S/O: Moorthy Raman',
  pincode: '560008',
  secure: true,
};

const blank = {};

describe('fillsFor', () => {
  it('maps the card onto the form fields it can populate', () => {
    const fills = fillsFor(CARD, blank);
    expect(fills.map((f) => [f.name, f.value])).toEqual([
      ['fullName', 'Ganesh Moorthy'],
      ['fatherName', 'Moorthy Raman'],
      ['gender', 'M'],
      ['dateOfBirth', '1990-12-31'],
      ['pincode', '560008'],
    ]);
  });

  it('never offers to fill the Aadhaar number itself', () => {
    expect(fillsFor(CARD, blank).map((f) => f.name)).not.toContain('aadhaar');
  });

  it("coerces Aadhaar's transgender code onto the form's OTHER option", () => {
    const t = fillsFor({ ...CARD, gender: 'T' }, blank).find((f) => f.name === 'gender');
    expect(t!.value).toBe('OTHER');
  });

  it('drops fields the card does not carry', () => {
    const sparse = fillsFor({ referenceId: '4829', name: 'Ilango M', secure: true }, blank);
    expect(sparse.map((f) => f.name)).toEqual(['fullName']);
  });

  it('omits the guardian when the card has no S/O-style prefix to strip', () => {
    const fills = fillsFor({ ...CARD, careOf: 'Some Village Road' }, blank);
    expect(fills.map((f) => f.name)).not.toContain('fatherName');
  });

  it('reports what the form already holds so overwrites can be flagged', () => {
    const fills = fillsFor(CARD, { fullName: 'Ganesh M', pincode: '560008' });
    const name = fills.find((f) => f.name === 'fullName')!;
    const pin = fills.find((f) => f.name === 'pincode')!;

    // Differs → applying it would overwrite the typed value.
    expect(name.current).toBe('Ganesh M');
    expect(name.current).not.toBe(name.value);

    // Identical → nothing to change.
    expect(pin.current).toBe(pin.value);
  });

  it('treats a whitespace-only form value as empty', () => {
    const fills = fillsFor(CARD, { fatherName: '   ' });
    expect(fills.find((f) => f.name === 'fatherName')!.current).toBe('');
  });
});
