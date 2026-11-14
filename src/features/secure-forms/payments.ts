import type { PaymentMethod } from '../../content.config';

/** A payment method can take money once the committee has filled in its details in the CMS. */
export const isRegistered = (m: Pick<PaymentMethod, 'enabled' | 'details'>): boolean => m.enabled && m.details.trim().length > 0;
