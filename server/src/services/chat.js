import mongoose from 'mongoose';
import { Conversation, Message, User } from '../models/index.js';
import { HttpError } from '../middleware/http.js';

export async function conversationFor(id, user) {
  const conversation = await Conversation.findById(id);
  if (!conversation || ![String(conversation.student), String(conversation.owner)].includes(user.id)) throw new HttpError(404, 'Conversation not found');
  return conversation;
}
// The database is a long round trip from the API server, so sending uses as few sequential trips as possible:
// one to load the conversation with both participants, one to save, then the push goes out straight away.
export async function sendMessage(id, user, text, io) {
  const [conversation] = await Conversation.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    { $lookup: { from: User.collection.name, let: { people: ['$student', '$owner'] }, pipeline: [{ $match: { $expr: { $in: ['$_id', '$$people'] } } }, { $project: { active: 1 } }], as: 'people' } },
  ]);
  if (!conversation || ![String(conversation.student), String(conversation.owner)].includes(user.id)) throw new HttpError(404, 'Conversation not found');
  const recipient = String(conversation.student) === user.id ? conversation.owner : conversation.student;
  if (!conversation.people.some(person => String(person._id) === String(recipient) && person.active)) throw new HttpError(409, 'Recipient is unavailable');
  const message = await Message.create({ conversation: id, sender: user._id, recipient, text });
  io?.to(`user:${conversation.student}`).to(`user:${conversation.owner}`).emit('message:new', message);
  await Conversation.updateOne({ _id: id }, { $set: { updatedAt: message.createdAt } });
  return message;
}
