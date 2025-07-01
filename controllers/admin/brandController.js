const Brand = require('../../models/brandSchema');

const getBrands = async (req, res) => {
  try {
    const brands = await Brand.find().lean();
    res.render('brand', { brands });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).send('Internal Server Error');
  }
};

const addBrands = async (req, res) => {
  try {
    const { name } = req.body;

    // Check if brand already exists
    const existing = await Brand.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.redirect('brand'); // Optionally add a flash message or query param to notify
    }

    const newBrand = new Brand({ name: name.trim() });
    await newBrand.save();

    res.redirect('/admin/brands');
  } catch (error) {
    console.error('Error adding brand:', error);
    res.status(500).send('Internal Server Error');
  }
};

const editBrands = async (req, res) => {
  try {
    const { id, name } = req.body;

    if (!id || !name) {
      return res.status(400).send('Missing required fields');
    }

    await Brand.findByIdAndUpdate(id, { name: name.trim() });

    res.redirect('/admin/brands');
  } catch (error) {
    console.error('Error updating brand:', error);
    res.status(500).send('Internal Server Error');
  }
};

const deleteBrands = async (req, res) => {
  try {
    const brandId = req.params.id;

    if (!brandId) {
      return res.status(400).send('Brand ID is required');
    }

    await Brand.findByIdAndDelete(brandId);

    res.redirect('/admin/brands');
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
  getBrands,
  addBrands,
  editBrands,
  deleteBrands,
};
