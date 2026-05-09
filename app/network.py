import socket


def internet_available(timeout_seconds: float = 2.0) -> bool:
    """
    Checks if Voxel can reach the internet.

    This does not download anything.
    It only tries to open a quick socket connection.
    """
    try:
        socket.create_connection(("1.1.1.1", 53), timeout=timeout_seconds)
        return True
    except OSError:
        return False