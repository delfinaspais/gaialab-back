/** Contexto de checkout: usuario logueado O carrito invitado por sesión. */
export type CheckoutCartContext = { userId: string } | { guestSessionId: string };
