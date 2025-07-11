import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const data = await prisma.recordCategory.findMany({ include: { records: true } });
  res.status(200).json(data);
}
