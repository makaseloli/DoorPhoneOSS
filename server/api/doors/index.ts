import { createError, readBody, setResponseHeader, setResponseStatus } from 'h3';
import { assertDoorName, createDoor, listDoors } from '../../utils/doors';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase();

  switch (method) {
    case 'GET':
      return listDoors();
    case 'POST': {
      const body = await readBody<{ name?: string }>(event);
      const name = assertDoorName(body?.name);
      const door = await createDoor(name);
      setResponseStatus(event, 201);
      return door;
    }
    default:
      setResponseHeader(event, 'Allow', 'GET, POST');
      throw createError({
        statusCode: 405,
        statusMessage: 'Method Not Allowed'
      });
  }
});
