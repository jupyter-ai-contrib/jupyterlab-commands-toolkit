"""JupyterLab Commands toolkit for Jupyter AI"""

try:
    from jupyter_ai.tools.models import Tool, Toolkit

    from typing import Optional
    from .tools import (
        open_document,
        open_markdown_file_in_preview_mode,
        clear_all_outputs_in_notebook,
        show_diff_of_current_notebook,
        INSERT_MODE,
    )

    # Create the toolkit
    toolkit = Toolkit(
        name="jupyterlab_commands_toolkit",
        description="""A comprehensive toolkit for controlling JupyterLab interface and performing notebook operations through AI commands.

    This toolkit provides programmatic access to JupyterLab's core functionality, enabling AI assistants to:

    **Document Management:**
    - Open files, notebooks, and documents with precise control over layout positioning
    - Support for split-pane layouts (top, left, right, bottom) and tab management
    - Open markdown files in rendered preview mode for better readability

    **Notebook Operations:**
    - Clear all cell outputs in the active notebook for cleanup and sharing
    - Display git diffs for notebooks using nbdime visualization
    - Maintain notebook structure while performing operations

    **Layout Control:**
    - Split current workspace into multiple panes
    - Merge content with adjacent areas
    - Create new tabs before or after current position
    - Flexible positioning options for optimal workspace organization

    **Key Features:**
    - Event-driven architecture using JupyterLab's command system
    - Seamless integration with Jupyter AI for natural language control
    - Support for relative file paths from server root directory
    - Comprehensive error handling and user feedback
    - Compatible with JupyterLab 4.0+ and modern Jupyter environments

    Use these tools to programmatically manage your JupyterLab workspace, organize documents, and perform common notebook operations through conversational AI interfaces.""",
    )

    # Add tools to the toolkit
    toolkit.add_tool(Tool(callable=open_document, read=True))
    toolkit.add_tool(Tool(callable=open_markdown_file_in_preview_mode, read=True))
    toolkit.add_tool(Tool(callable=clear_all_outputs_in_notebook, read=True))
    toolkit.add_tool(Tool(callable=show_diff_of_current_notebook, read=True))
except ImportError:
    # If jupyter-ai is not available, the AI toolkit won't be available
    toolkit = None
