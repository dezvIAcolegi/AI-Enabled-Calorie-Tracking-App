from fastapi import APIRouter

# Sebi: POST /meal/photo and POST /meal/text go here.
router = APIRouter(prefix="/meal", tags=["meal"])
