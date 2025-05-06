from typing import Generator
from pathlib import Path
from playwright.sync_api import Playwright, BrowserContext
import pytest
import time

@pytest.fixture()
def context(playwright: Playwright) -> Generator[BrowserContext, None, None]:
    path_to_extension = Path(__file__).parent.parent.joinpath("client")
    context = playwright.chromium.launch_persistent_context(
        "",
        channel="chromium",
        args=[
            f"--disable-extensions-except={path_to_extension}",
            f"--load-extension={path_to_extension}",
        ],
    )
    yield context
    context.close()

@pytest.fixture()
def extension_id(context) -> Generator[str, None, None]:
    time.sleep(1)
    
    if context.background_pages:
        background = context.background_pages[0]
    elif context.service_workers:
        background = context.service_workers[0]
    else:
        background = context.wait_for_event("serviceworker")
    
    extension_id = background.url.split("/")[2]
    yield extension_id