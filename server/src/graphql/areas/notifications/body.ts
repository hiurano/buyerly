import { validate, type Check } from '../../../notifications/model.ts';
import { invalidInput } from '../../errors.ts';

// A field's `input: JSON!` checked by one of the area's pydantic models; a
// missing input is an empty body, as bridge.py validates None as {}.
export function parseBody<T>(check: Check<T>, input: unknown): T {
  const { value, issues } = validate(check, input ?? {});
  if (value === null) throw invalidInput(issues);
  return value;
}
