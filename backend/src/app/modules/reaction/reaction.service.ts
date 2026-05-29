import ApiError from "../../../errors/api_error";
import { ITokenPayload } from "../../../interfaces/token";
import { User } from "../user/user.model";
import httpStatus from "http-status";
import { Reaction } from "./reaction.model";
import { Types } from "mongoose";
import { Post } from "../post/post.model";

const toggleReaction = async (
  postId: string,
  type: string = "like",
  token: ITokenPayload
) => {
  const { email } = token;
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User not found!");
  }
  const post = await Post.findOne({ _id: postId, isDeleted: { $ne: true } });
  if (!post) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Post not found!");
  }

  // Atomically find and delete the reaction if it exists
  const deletedReaction = await Reaction.findOneAndDelete({
    postId: new Types.ObjectId(postId),
    userId: user._id,
    type: type,
  });

  if (deletedReaction) {
    // Atomically decrement likesCount and remove the reaction ID
    const updatedPost = await Post.findOneAndUpdate(
      { _id: postId },
      {
        $inc: { likesCount: -1 },
        $pull: { reactions: deletedReaction._id },
      },
      { new: true }
    );
    const likesCount = updatedPost ? Math.max(0, updatedPost.likesCount) : 0;
    return { message: "Reaction removed", likesCount };
  } else {
    // Add reaction atomically
    try {
      const newReaction = await Reaction.create({
        postId: new Types.ObjectId(postId),
        userId: user._id,
        type: type,
      });

      // Atomically increment likesCount and push the new reaction ID
      const updatedPost = await Post.findOneAndUpdate(
        { _id: postId },
        {
          $inc: { likesCount: 1 },
          $addToSet: { reactions: newReaction._id },
        },
        { new: true }
      );
      const likesCount = updatedPost ? updatedPost.likesCount : 0;
      return { message: "Reaction added", likesCount };
    } catch (error: any) {
      // Handle rare duplicate reaction race condition
      if (error.code === 11000) {
        const currentPost = await Post.findById(postId);
        return { message: "Reaction added", likesCount: currentPost ? currentPost.likesCount : 0 };
      }
      throw error;
    }
  }
};

export const ReactionService = {
  toggleReaction,
};
