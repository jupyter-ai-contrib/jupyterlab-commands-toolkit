from typing import Literal, Optional
from jupyter_server.serverapp import ServerApp


def emit(data): 
    server = ServerApp.instance()
    server.io_loop.call_later(
        0.1, 
        server.event_logger.emit,         
        schema_id="https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1", 
        data=data
    )


INSERT_MODE = Literal['split-top', 'split-left', 'split-right', 'split-bottom', 'merge-top', 'merge-left', 'merge-right', 'merge-bottom', 'tab-before', 'tab-after']


def open_document(relative_path: str, mode: Optional[INSERT_MODE] = None) -> None:
    """
    Open a document in JupyterLab.
    
    This function opens a document at the specified path in JupyterLab by emitting
    a 'docmanager:open' command. The document can be opened in various modes that
    control how it's displayed relative to existing open documents.
    
    Args:
        relative_path (str): The relative path to the document to open.
            This should be relative to the Jupyter server's root directory.
            Examples: 'notebook.ipynb', 'folder/script.py', 'data.csv'
            
        mode (Optional[INSERT_MODE], optional): The mode specifying how to open
            the document. Defaults to None, which opens in the default manner.
            Available modes:
            - 'split-top': Split the current area and open above
            - 'split-left': Split the current area and open to the left
            - 'split-right': Split the current area and open to the right
            - 'split-bottom': Split the current area and open below
            - 'merge-top': Merge with the area above
            - 'merge-left': Merge with the area to the left
            - 'merge-right': Merge with the area to the right
            - 'merge-bottom': Merge with the area below
            - 'tab-before': Open as a tab before the current tab
            - 'tab-after': Open as a tab after the current tab
    
    Returns:
        None: This function doesn't return a value. It emits an event to JupyterLab
        to trigger the document opening action.
        
    Examples:
        >>> open_document('notebook.ipynb')  # Open notebook in default mode
        >>> open_document('script.py', mode='split-right')  # Open script in right split
        >>> open_document('data/analysis.csv', mode='tab-after')  # Open CSV as new tab
    
    Note:
        This function requires a running Jupyter server instance and emits events
        using the JupyterLab command toolkit event schema.
    """
    emit({
        "name": "docmanager:open",
        "args": {
            "path": relative_path,
            "options": {
                "mode": mode
            }
        }
    })


def open_markdown_file_in_preview_mode(relative_path: str, mode: Optional[INSERT_MODE] = None) -> None:
    """
    Open a markdown file in preview mode in JupyterLab.
    
    This function opens a markdown file (.md) in rendered preview mode rather than
    as an editable text file. It emits a 'markdownviewer:open' command to display
    the markdown content with proper formatting, headers, links, and styling.
    
    Args:
        relative_path (str): The relative path to the markdown file to open in preview.
            This should be relative to the Jupyter server's root directory and
            typically should have a .md extension.
            Examples: 'README.md', 'docs/guide.md', 'notes/meeting-notes.md'
            
        mode (Optional[INSERT_MODE], optional): The mode specifying how to open
            the preview. Defaults to None, which opens in the default manner.
            Available modes:
            - 'split-top': Split the current area and open preview above
            - 'split-left': Split the current area and open preview to the left
            - 'split-right': Split the current area and open preview to the right
            - 'split-bottom': Split the current area and open preview below
            - 'merge-top': Merge with the area above
            - 'merge-left': Merge with the area to the left
            - 'merge-right': Merge with the area to the right
            - 'merge-bottom': Merge with the area below
            - 'tab-before': Open as a tab before the current tab
            - 'tab-after': Open as a tab after the current tab
    
    Returns:
        None: This function doesn't return a value. It emits an event to JupyterLab
        to trigger the markdown preview opening action.
        
    Examples:
        >>> open_markdown_file_in_preview_mode('README.md')  # Open README in preview
        >>> open_markdown_file_in_preview_mode('docs/api.md', mode='split-right')  # Preview in right split
        >>> open_markdown_file_in_preview_mode('changelog.md', mode='tab-after')  # Preview in new tab
    
    Note:
        - This function specifically opens markdown files in rendered preview mode
        - Use open_document() instead if you want to edit the markdown source
        - Requires a running Jupyter server with markdown preview extension
        - The file should typically have a .md or .markdown extension
    """
    emit({
        "name": "markdownviewer:open",
        "args": {
            "path": relative_path,
            "options": {
                "mode": mode
            }
        }
    })


def clear_all_outputs_in_notebook(run: bool) -> None:
    """
    Clear all outputs in the active notebook.
    
    This function clears all cell outputs in the currently active notebook by 
    emitting a 'notebook:clear-all-cell-outputs' command. This is useful for 
    cleaning up notebook outputs before sharing or when outputs are no longer 
    needed.
    
    Args:
        run (bool): Run this command.
    
    Returns:
        None: This function doesn't return a value. It emits an event to JupyterLab
        to trigger the clear all outputs action.
        
    Examples:
        >>> clear_all_outputs_in_notebook()  # Clear all outputs in current notebook
    
    Note:
        - This function only works when a notebook is currently active/focused
        - All cell outputs (including text, images, plots, etc.) will be cleared
        - The cell source code remains unchanged, only outputs are removed
        - This action cannot be undone, so use with caution
        - Requires an active notebook session in JupyterLab
    """
    emit({
        "name": "notebook:clear-all-cell-outputs",
        "args": {}
    })


def show_diff_of_current_notebook(run: bool) -> None:
    """
    Show git diff of the current notebook in JupyterLab.
    
    This function displays the git differences for the currently active notebook
    by emitting an 'nbdime:diff-git' command. It uses nbdime (Jupyter notebook
    diff tool) to show a visual comparison between the current notebook state
    and the last committed version in git.
    
    Args:
        run (bool): Run this command.
    
    Returns:
        None: This function doesn't return a value. It emits an event to JupyterLab
        to trigger the notebook diff display.
        
    Examples:
        >>> show_diff_of_current_notebook(True)  # Show git diff for current notebook
    
    Note:
        - This function only works when a notebook is currently active/focused
        - Requires the nbdime extension to be installed and enabled in JupyterLab
        - The notebook must be in a git repository for diffs to be meaningful
        - Shows differences between current state and last git commit
        - Displays both content and output differences in a visual format
        - Useful for reviewing changes before committing notebook modifications
    """
    emit({
        "name": "nbdime:diff-git",
        "args": {}
    })