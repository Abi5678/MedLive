import logging

logger = logging.getLogger(__name__)

async def emit_ui_update(target: str, data: dict, tool_context=None) -> dict:
    """Sends a real-time Generative UI update to the frontend.
    
    Target can be 'profile_preview', 'adherence_chart', etc.
    """
    logger.info(f"Emitting UI update targeted for {target}: {data}")
    try:
        if tool_context:
            # The WS connection loop should listen for these specific state keys
            # and dispatch them as JSON events down to the Javascript client
            if "ui_events" not in tool_context.state:
                tool_context.state["ui_events"] = []
            
            tool_context.state["ui_events"].append({
                "type": "ui_update",
                "target": target,
                "data": data
            })
            
        return {"status": "success", "message": "UI update dispatched"}
    except Exception as e:
        logger.error(f"Failed to dispatch UI event: {e}")
        return {"status": "error", "message": str(e)}
