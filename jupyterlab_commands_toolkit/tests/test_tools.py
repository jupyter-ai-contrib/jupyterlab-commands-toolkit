import asyncio

from jupyterlab_commands_toolkit.tools import emit, target_client_id

COMMAND_SCHEMA_ID = (
    "https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1"
)


async def emitted_command(serverapp, data):
    """Emit a command and return the event received by the event logger."""
    future = asyncio.get_running_loop().create_future()

    async def listener(logger, schema_id, data):
        future.set_result(data)

    serverapp.event_logger.add_listener(schema_id=COMMAND_SCHEMA_ID, listener=listener)
    emit(data)
    return await asyncio.wait_for(future, timeout=5)


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
