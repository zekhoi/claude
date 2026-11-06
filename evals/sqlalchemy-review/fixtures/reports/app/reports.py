from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Order, OrderItem


def recent_orders(session: Session, tenant_id: int, limit: int = 50) -> list[Order]:
    statement = (
        select(Order)
        .where(Order.tenant_id == tenant_id)
        .options(selectinload(Order.items))
        .order_by(Order.id.desc())
        .limit(limit)
    )
    return list(session.scalars(statement))


def units_by_sku(session: Session, tenant_id: int) -> dict[str, int]:
    statement = (
        select(OrderItem.sku, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.tenant_id == tenant_id)
        .group_by(OrderItem.sku)
        .order_by(OrderItem.sku)
    )
    return {sku: int(total) for sku, total in session.execute(statement)}


def mark_shipped(session: Session, tenant_id: int, order_id: int) -> bool:
    """Marks an order shipped; the caller owns the transaction and commits."""
    order = session.scalars(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    ).one_or_none()
    if order is None:
        return False
    order.status = "shipped"
    return True
