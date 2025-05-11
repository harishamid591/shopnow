const categoryModel = require("../../models/categorySchema")
const fs = require('fs');
const path = require("path");
const sharp = require('sharp')

const categoryInfo = async (req, res) => {

    try {

        const query = {}
        const q = req.query.search;
        if(req.query.search){
            query.categoryName = {$regex:`^${req.query.search}`, $options: "i"}
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const categoryData = await categoryModel.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);  

        const totalCategories = await categoryModel.countDocuments();

        const totalPages = Math.ceil(totalCategories / limit);


        res.render('category', {
            categories: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        })
    } catch (error) {
        console.error(error);
        res.redirect('/pageerror');
    }
}

const addCategory = async (req, res) => {
 
    try {

        const { categoryName } = req.body;

        const existsCategory = await categoryModel.findOne({categoryName});
    
        if(existsCategory){
            return res.json({error:'Category already exists'})
        }
    
        const originalImagePath = req.file.path;
    
        const resizeImagePath = path.join('public', 'uploads', 'category', req.file.filename);
        await sharp(originalImagePath).resize({ width: 440, height: 440 }).toFile(resizeImagePath);
    
        const imagePath = path.join('/','uploads', 'category', req.file.filename)
    
        const newCategory = new categoryModel({
            categoryName:categoryName,
            categoryImage:imagePath
        })
    
        await newCategory.save();

        return res.json({ success: 'Category added successfully' });

    
        // return res.redirect('/admin/category');

    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }

}

const editCategory = async (req,res)=>{

    try {

        const categoryId = req.params.id;

        const {categoryName} = req.body

        const existingCategory = await categoryModel.findOne({
            _id: { $ne: categoryId },
            categoryName: categoryName
          });
          
          if (existingCategory) {
            return res.json({
              success: false,
              message: 'Category with same name is not allowed'
            });
          }

        if(req.file){
            const originalImagePath = req.file.path;
        
            const resizeImagePath = path.join('public', 'uploads', 'category', req.file.filename);
            await sharp(originalImagePath).resize({ width: 440, height: 440 }).toFile(resizeImagePath);
        
            const imagePath = path.join('/','uploads', 'category', req.file.filename)

            const updateData = {
                categoryName:categoryName,
                categoryImage:imagePath
            }

            await categoryModel.updateOne({_id:categoryId},{$set:updateData})
        }else{
            
            await categoryModel.updateOne({_id:categoryId},{categoryName:categoryName});
        }

        return res.json({ success:true, message:'Category edited successfully' });

    } catch (error) {
        console.log('edit category error')
        return res.status(500).json({ error: 'Internal server error' })
    }
}

const deleteCategory = async (req,res)=>{
    
    try {
        const categoryId = req.params.id

        await categoryModel.deleteOne({_id:categoryId});

        res.json({success:'Category deleted successfully'})

    } catch (error) {
        res.status.json({success:'Internal Server error'})
    }
}

const listOrUnlistCategory = async (req,res)=>{
    try {
        const categoryId = req.params.id;

        const category = await categoryModel.findById(categoryId);

        if(!category) return res.status(404).json({error:'Category not found'});

        category.isListed = !category.isListed;

        await category.save();

        res.json({ success: `Category has been ${category.isListed ? 'listed' : 'unlisted'}` });
    } catch (error) {
        console.error('category list or unlist error')
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = {
    categoryInfo,
    addCategory,
    editCategory,
    deleteCategory,
    listOrUnlistCategory
}