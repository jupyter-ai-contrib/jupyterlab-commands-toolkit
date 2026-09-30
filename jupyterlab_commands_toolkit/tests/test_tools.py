import asyncio

from jupyterlab_commands_toolkit.tools import (
    emit,
    emit_and_wait_for_result,
    pending_requests,
    target_client_id,
)

COMMAND_SCHEMA_ID = (
    "https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1"
)
RESULT_SCHEMA_ID = (
    "https://events.jupyter.org/jupyterlab_command_toolkit/lab_command_result/v1"
)
ACK_SCHEMA_ID = (
    "https://events.jupyter.org/jupyterlab_command_toolkit/lab_command_ack/v1"
)


async def emitted_command(serverapp, data):
    """Emit a command and return the event received by the event logger."""
    future = asyncio.get_running_loop().create_future()

    async def listener(logger, schema_id, data):
        future.set_result(data)

    serverapp.event_logger.add_listener(schema_id=COMMAND_SCHEMA_ID, listener=listener)
    emit(data)
    return await asyncio.wait_for(future, timeout=5)


def connect_web_client(serverapp, client_id="client-1", ack=True, result=True):
    """
    Emulate a web client that acknowledges and executes the commands it receives.
    """

    async def listener(logger, schema_id, data):
        if data.get("client_id", client_id) != client_id:
            return
        request_id = data["requestId"]
        if ack:
            logger.emit(
                schema_id=ACK_SCHEMA_ID,
                data={"requestId": request_id, "client_id": client_id},
            )
        if result:
            logger.emit(
                schema_id=RESULT_SCHEMA_ID,
                data={"requestId": request_id, "success": True, "result": data["name"]},
            )

    serverapp.event_logger.add_listener(schema_id=COMMAND_SCHEMA_ID, listener=listener)


async def test_emit_to_all_clients(jp_serverapp):
    event = await emitted_command(jp_serverapp, {"name": "test:command"})
    assert event["name"] == "test:command"
    assert "client_id" not in event


async def test_emit_to_target_client(jp_serverapp):
    token = target_client_id.set("client-1")
    try:
        event = await emitted_command(jp_serverapp, {"name": "test:command"})
    finally:
        target_client_id.reset(token)
    assert event["client_id"] == "client-1"


async def test_command_result(jp_serverapp):
    connect_web_client(jp_serverapp)
    result = await emit_and_wait_for_result({"name": "test:command", "args": {}})
    assert result["success"]
    assert result["result"] == "test:command"


async def test_command_result_without_ack(jp_serverapp):
    connect_web_client(jp_serverapp, ack=False)
    result = await emit_and_wait_for_result(
        {"name": "test:command", "args": {}}, ack_timeout=0.5
    )
    assert result["success"]


async def test_no_web_client(jp_serverapp):
    start = asyncio.get_running_loop().time()
    result = await emit_and_wait_for_result({"name": "test:command", "args": {}})
    assert asyncio.get_running_loop().time() - start < 1
    assert not result["success"]
    assert result["error_code"] == "no_web_client"
    assert result["error"].startswith("No JupyterLab web client is connected")
    assert not pending_requests


async def test_no_web_client_ack(jp_serverapp):
    connect_web_client(jp_serverapp, ack=False, result=False)
    result = await emit_and_wait_for_result(
        {"name": "test:command", "args": {}}, ack_timeout=0.5
    )
    assert not result["success"]
    assert result["error_code"] == "no_web_client"
    assert result["error"].startswith("No JupyterLab web client received the command")


async def test_target_web_client_not_connected(jp_serverapp):
    connect_web_client(jp_serverapp, client_id="client-1")
    token = target_client_id.set("client-2")
    try:
        result = await emit_and_wait_for_result(
            {"name": "test:command", "args": {}}, ack_timeout=0.5
        )
    finally:
        target_client_id.reset(token)
    assert not result["success"]
    assert result["error_code"] == "web_client_not_found"
    assert result["error"].startswith("The web client client-2 did not receive")


async def test_command_timeout(jp_serverapp):
    connect_web_client(jp_serverapp, result=False)
    result = await emit_and_wait_for_result(
        {"name": "test:command", "args": {}}, timeout=0.5
    )
    assert not result["success"]
    assert result["error_code"] == "timeout"
    assert result["error"].startswith("Command timed out after 0.5 seconds")


async def test_invalid_command(jp_serverapp):
    result = await emit_and_wait_for_result({"name": "test:command", "args": "x"})
    assert not result["success"]
    assert result["error_code"] == "invalid_command"
    assert result["error"].startswith("Invalid command at $.args")
