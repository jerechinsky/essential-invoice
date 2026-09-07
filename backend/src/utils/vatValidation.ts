import { body } from 'express-validator';
import { roundMoney } from './money';

export function vatValidation() {
  return [
    body('vatRate').optional().isFloat({ min: 0, max: 100 }).custom(value => Number(value) === roundMoney(Number(value))).withMessage('VAT rate must be between 0 and 100, with at most two decimal places'),
    body('items.*.vatRate').optional().isFloat({ min: 0, max: 100 }).custom(value => Number(value) === roundMoney(Number(value))).withMessage('VAT rate must be between 0 and 100, with at most two decimal places'),
    body('items.*.vatTreatment').optional().isIn(['standard', 'exempt', 'reverse_charge']),
    body('items.*.vatCode').optional().isString().isLength({ max: 20 }),
    body('items.*.vatReason').optional().isString().isLength({ max: 300 }),
    body('items').optional().custom(items => {
      if (!Array.isArray(items)) return false;
      return items.every(item => item &&
        (item.vatTreatment !== 'reverse_charge' || (typeof item.vatCode === 'string' && /^[0-9]+(?:\.[0-9]+)?$/.test(item.vatCode))) &&
        (item.vatTreatment !== 'exempt' ||
          (typeof item.vatReason === 'string' && item.vatReason.trim().length > 0 &&
            (item.vatRate === undefined || Number(item.vatRate) === 0))));
    }).withMessage('Exempt lines require a reason and zero rate; reverse charge requires a supply code'),
  ];
}
