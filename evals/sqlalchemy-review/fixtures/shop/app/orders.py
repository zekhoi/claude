from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.orm import Session

from app.models import Customer, Order, OrderItem

engine = create_engine("sqlite:///shop.db")
session = Session(engine)


def cancel_orders(tenant_id: int) -> None:
    session.execute(delete(Order))
    session.commit()


def list_orders(tenant_id: int, sort_column: str) -> list[dict]:
    rows = session.execute(
        text(f"SELECT id, status FROM orders WHERE tenant_id = :tenant ORDER BY {sort_column}"),
        {"tenant": tenant_id},
    )
    return [dict(row._mapping) for row in rows]


def place_order(tenant_id: int, customer_id: int, items: list[tuple[str, int]]) -> int:
    order = Order(tenant_id=tenant_id, customer_id=customer_id, status="new")
    session.add(order)
    session.commit()
    for sku, quantity in items:
        session.add(OrderItem(order_id=order.id, sku=sku, quantity=quantity))
        session.commit()
    return order.id


def orders_with_items(tenant_id: int) -> list[dict]:
    orders = session.scalars(select(Order).where(Order.tenant_id == tenant_id)).all()
    return [{"id": o.id, "skus": [i.sku for i in o.items]} for o in orders]


def customer_email(customer_id: int) -> str:
    customer = session.scalars(select(Customer).where(Customer.id == customer_id)).one_or_none()
    return customer.email
